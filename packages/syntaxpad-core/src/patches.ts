import { analyzeGrammar } from "./model.js";
import { parseGrammar } from "./parser.js";
import type {
  GrammarDiagnostic,
  GrammarDocument,
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

const errorKeys = (diagnostics: readonly GrammarDiagnostic[]): readonly string[] =>
  diagnostics
    .filter((diagnostic) => diagnostic.severity === "error")
    .map((diagnostic) => `${diagnostic.code}\u0000${diagnostic.message}`);

const unknownFragments = (document: GrammarDocument): readonly string[] => [
  ...document.unknown.map((node) => document.source.slice(node.range.start, node.range.end).trim()),
  ...document.rules.flatMap((rule) =>
    rule.alternatives.flatMap((alternative) =>
      alternative.items.flatMap((item) => (item.kind === "unknown" ? [item.text.trim()] : [])),
    ),
  ),
];

export const finalizeTransform = (options: {
  readonly allowStartSymbolChange?: boolean;
  readonly conflictCheckRecommended?: boolean;
  readonly document: GrammarDocument;
  readonly patches: readonly TextPatch[];
  readonly verify?: (updated: GrammarDocument) => TransformError | undefined;
  readonly warnings?: readonly string[];
}): TransformResult => {
  let preview: string;
  try {
    preview = applyTextPatches(options.document.source, options.patches);
  } catch (error: unknown) {
    return transformFailure({
      code: "invalid-patch-set",
      message: error instanceof Error ? error.message : "Patch validation failed.",
    });
  }

  const updated = parseGrammar(preview, { dialect: options.document.dialect });
  const previousModel = analyzeGrammar(options.document);
  const nextModel = analyzeGrammar(updated);
  if (hasNewEntries(errorKeys(previousModel.diagnostics), errorKeys(nextModel.diagnostics))) {
    return transformFailure({
      code: "postcondition-analysis-error",
      message: "The transformation would introduce a new grammar error.",
    });
  }
  if (hasNewEntries(unknownFragments(options.document), unknownFragments(updated))) {
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
    patches: validatePatches(options.document.source, options.patches),
    preview,
    warnings: options.warnings ?? [],
  };
  return { ok: true, plan };
};
