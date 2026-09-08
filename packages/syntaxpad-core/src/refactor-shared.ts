import type {
  ActionReference,
  AlternativeItem,
  AlternativeNode,
  GrammarDocument,
  RuleNode,
  SourceRange,
  TextPatch,
  TransformResult,
} from "./types.js";

export const isSemanticItem = (item: AlternativeItem): boolean =>
  item.kind === "action" ||
  item.kind === "literal" ||
  item.kind === "parameterized" ||
  item.kind === "symbol";

export const resolveUniqueRule = (
  document: GrammarDocument,
  name: string,
): RuleNode | TransformResult => {
  const matches = document.rules.filter((rule) => rule.name === name);
  const concrete = matches.filter((rule) => !rule.parameterized);
  const candidates = concrete.length > 0 ? concrete : matches;
  const match = candidates[0];
  if (candidates.length === 1 && match !== undefined) {
    return match;
  }
  return {
    error: {
      code: matches.length === 0 ? "rule-not-found" : "ambiguous-rule",
      message:
        matches.length === 0
          ? `Rule "${name}" was not found.`
          : `Rule "${name}" has multiple definitions.`,
    },
    ok: false,
  };
};

export const isTransformFailure = (value: object | TransformResult): value is TransformResult =>
  "ok" in value;

export const findAlternativeContaining = (
  document: GrammarDocument,
  range: SourceRange,
): { readonly alternative: AlternativeNode; readonly rule: RuleNode } | undefined => {
  for (const rule of document.rules) {
    for (const alternative of rule.alternatives) {
      if (range.start >= alternative.range.start && range.end <= alternative.range.end) {
        return { alternative, rule };
      }
    }
  }
  return undefined;
};

const referenceNumberRange = (reference: ActionReference): SourceRange | undefined => {
  if (reference.target.kind !== "index") {
    return undefined;
  }
  return reference.targetRange;
};

export const createIndexPatch = (
  reference: ActionReference,
  index: number,
): TextPatch | undefined => {
  const range = referenceNumberRange(reference);
  return range === undefined ? undefined : { range, text: String(index) };
};

export const semanticPositionOf = (
  items: readonly AlternativeItem[],
  target: AlternativeItem,
): number => {
  let position = 0;
  for (const item of items) {
    if (isSemanticItem(item)) {
      position += 1;
    }
    if (item === target) {
      return position;
    }
  }
  return -1;
};

export const intersects = (left: SourceRange, right: SourceRange): boolean =>
  left.start < right.end && right.start < left.end;

export const failure = (code: string, message: string, range?: SourceRange): TransformResult => ({
  error: range === undefined ? { code, message } : { code, message, range },
  ok: false,
});
