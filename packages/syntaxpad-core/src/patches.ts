import { analyzeGrammar } from "./model.js";
import { parseGrammar } from "./parser.js";
import type {
  GrammarDiagnostic,
  GrammarDocument,
  SourceRange,
  TextPatch,
  TransformError,
  TransformPlan,
  TransformResult,
} from "./types.js";

export class InvalidPatchError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "InvalidPatchError";
  }
}

const comparePatchRanges = (left: TextPatch, right: TextPatch): number =>
  left.range.start - right.range.start ||
  left.range.end - right.range.end ||
  (left.sequence ?? 0) - (right.sequence ?? 0);

export const validatePatches = (
  source: string,
  patches: readonly TextPatch[],
): readonly TextPatch[] => {
  const sorted = [...patches].sort(comparePatchRanges);
  let previous: TextPatch | undefined;
  for (const patch of sorted) {
    if (
      patch.range.start < 0 ||
      patch.range.end < patch.range.start ||
      patch.range.end > source.length
    ) {
      throw new InvalidPatchError(
        `Patch range [${String(patch.range.start)}, ${String(patch.range.end)}) is outside the source.`,
      );
    }
    if (
      previous !== undefined &&
      patch.range.start < previous.range.end &&
      !(patch.range.start === patch.range.end && previous.range.start === previous.range.end)
    ) {
      throw new InvalidPatchError(
        `Patch range [${String(patch.range.start)}, ${String(patch.range.end)}) overlaps a previous patch.`,
      );
    }
    previous = patch;
  }
  return sorted;
};

export const applyTextPatches = (source: string, patches: readonly TextPatch[]): string => {
  const sorted = validatePatches(source, patches);
  const applicationOrder = [...sorted].sort(
    (left, right) =>
      right.range.start - left.range.start ||
      right.range.end - left.range.end ||
      (right.sequence ?? 0) - (left.sequence ?? 0),
  );

  return applicationOrder.reduce(
    (result, patch) =>
      `${result.slice(0, patch.range.start)}${patch.text}${result.slice(patch.range.end)}`,
    source,
  );
};

const transformFailure = (error: TransformError): TransformResult => ({ error, ok: false });

const hasNewEntries = (previous: readonly string[], next: readonly string[]): boolean => {
  const remaining = new Map<string, number>();
  previous.forEach((entry) => remaining.set(entry, (remaining.get(entry) ?? 0) + 1));
  return next.some((entry) => {
    const count = remaining.get(entry) ?? 0;
    if (count === 0) {
      return true;
    }
    remaining.set(entry, count - 1);
    return false;
  });
};

const rangeAfterPatches = (
  range: SourceRange,
  patches: readonly TextPatch[],
): SourceRange | undefined => {
  const touched = patches.some(
    (patch) =>
      (patch.range.start < range.end && range.start < patch.range.end) ||
      (patch.range.start === patch.range.end &&
        patch.range.start > range.start &&
        patch.range.start < range.end),
  );
  if (touched) {
    return undefined;
  }
  const shift = patches
    .filter((patch) => patch.range.end <= range.start)
    .reduce((total, patch) => total + patch.text.length - (patch.range.end - patch.range.start), 0);
  return { end: range.end + shift, start: range.start + shift };
};

const errorKeys = (
  diagnostics: readonly GrammarDiagnostic[],
  patches: readonly TextPatch[],
  trackRanges: boolean,
): readonly string[] =>
  diagnostics.flatMap((diagnostic) => {
    if (diagnostic.severity !== "error") {
      return [];
    }
    if (!trackRanges) {
      return [`${diagnostic.code}\u0000${diagnostic.message}`];
    }
    const range = rangeAfterPatches(diagnostic.range, patches);
    return range === undefined
      ? []
      : [
          `${diagnostic.code}\u0000${diagnostic.message}\u0000${String(range.start)}:${String(range.end)}`,
        ];
  });

const unknownEntries = (
  document: GrammarDocument,
): readonly { readonly range: SourceRange; readonly text: string }[] => [
  ...document.unknown.map((node) => ({
    range: node.range,
    text: document.source.slice(node.range.start, node.range.end).trim(),
  })),
  ...document.rules.flatMap((rule) =>
    rule.alternatives.flatMap((alternative) =>
      alternative.items.flatMap((item) =>
        item.kind === "unknown" ? [{ range: item.range, text: item.text.trim() }] : [],
      ),
    ),
  ),
];

const unknownKeys = (document: GrammarDocument, patches: readonly TextPatch[]): readonly string[] =>
  unknownEntries(document).flatMap((entry) => {
    const range = rangeAfterPatches(entry.range, patches);
    return range === undefined
      ? []
      : [`${entry.text}\u0000${String(range.start)}:${String(range.end)}`];
  });

export const finalizeTransform = (options: {
  readonly allowErrorRelocation?: boolean;
  readonly allowStartSymbolChange?: boolean;
  readonly conflictCheckRecommended?: boolean;
  readonly document: GrammarDocument;
  readonly patches: readonly TextPatch[];
  readonly verify?: (updated: GrammarDocument) => TransformError | undefined;
  readonly warnings?: readonly string[];
}): TransformResult => {
  let preview: string;
  let patches: readonly TextPatch[];
  try {
    patches = validatePatches(options.document.source, options.patches);
    preview = applyTextPatches(options.document.source, patches);
  } catch (error: unknown) {
    return transformFailure({
      code: "invalid-patch-set",
      message: error instanceof Error ? error.message : "Patch validation failed.",
    });
  }

  const updated = parseGrammar(preview, { dialect: options.document.dialect });
  const previousModel = analyzeGrammar(options.document);
  const nextModel = analyzeGrammar(updated);
  const trackErrorRanges = options.allowErrorRelocation !== true;
  if (
    hasNewEntries(
      errorKeys(previousModel.diagnostics, patches, trackErrorRanges),
      errorKeys(nextModel.diagnostics, [], trackErrorRanges),
    )
  ) {
    return transformFailure({
      code: "postcondition-analysis-error",
      message: "The transformation would introduce a new grammar error.",
    });
  }
  if (hasNewEntries(unknownKeys(options.document, patches), unknownKeys(updated, []))) {
    return transformFailure({
      code: "postcondition-unknown-region",
      message: "The transformation would introduce an unrecognized grammar region.",
    });
  }
  if (
    options.allowStartSymbolChange !== true &&
    previousModel.startSymbol !== nextModel.startSymbol
  ) {
    return transformFailure({
      code: "postcondition-start-symbol-changed",
      message: "The transformation would change the grammar start symbol.",
    });
  }

  const verificationError = options.verify?.(updated);
  if (verificationError !== undefined) {
    return transformFailure(verificationError);
  }

  const plan: TransformPlan = {
    conflictCheckRecommended: options.conflictCheckRecommended ?? false,
    patches,
    preview,
    warnings: options.warnings ?? [],
  };
  return { ok: true, plan };
};
