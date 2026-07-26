import { applyTextPatches, finalizeTransform } from "./patches.js";
import {
  createIndexPatch,
  failure,
  findAlternativeContaining,
  intersects,
  isSemanticItem,
  isTransformFailure,
  resolveUniqueRule,
  semanticPositionOf,
} from "./refactor-shared.js";
import { formatNewRuleAlternatives } from "./style.js";
import type {
  ActionItem,
  AlternativeItem,
  AlternativeNode,
  GrammarDocument,
  RuleNode,
  SourceRange,
  TextPatch,
  TransformResult,
} from "./types.js";

const VALID_SYMBOL_NAME = /^[A-Za-z_.][A-Za-z0-9_.-]*$/u;

interface SelectionContext {
  readonly alternative: AlternativeNode;
  readonly first: AlternativeItem;
  readonly last: AlternativeItem;
  readonly range: SourceRange;
  readonly rule: RuleNode;
  readonly selected: readonly AlternativeItem[];
  readonly semanticCount: number;
  readonly startPosition: number;
}

const selectableItem = (item: AlternativeItem): boolean =>
  item.kind === "literal" || item.kind === "parameterized" || item.kind === "symbol";

const selectionContext = (
  document: GrammarDocument,
  selection: SourceRange,
): SelectionContext | TransformResult => {
  if (selection.end <= selection.start) {
    return failure("empty-selection", "Select one or more grammar symbols.");
  }
  const containing = findAlternativeContaining(document, selection);
  if (containing === undefined) {
    return failure(
      "selection-outside-alternative",
      "The selection must be inside one rule alternative.",
      selection,
    );
  }

  const intersecting = containing.alternative.items.filter((item) =>
    intersects(item.range, selection),
  );
  if (intersecting.length === 0 || intersecting.some((item) => !selectableItem(item))) {
    return failure(
      "unsafe-selection",
      "The selection must contain only symbols or literals; actions and directives cannot cross the boundary.",
      selection,
    );
  }
  if (
    intersecting.some(
      (item) => item.range.start < selection.start || item.range.end > selection.end,
    )
  ) {
    return failure(
      "partial-item-selection",
      "The selection cuts through a grammar item.",
      selection,
    );
  }

  const indices = intersecting.map((item) => containing.alternative.items.indexOf(item));
  const firstIndex = Math.min(...indices);
  const lastIndex = Math.max(...indices);
  const between = containing.alternative.items.slice(firstIndex, lastIndex + 1);
  if (between.some((item) => !intersecting.includes(item) && isSemanticItem(item))) {
    return failure(
      "noncontiguous-selection",
      "The selected grammar symbols must be contiguous.",
      selection,
    );
  }

  const first = intersecting[0];
  const last = intersecting.at(-1);
  if (first === undefined || last === undefined) {
    return failure("empty-selection", "Select one or more grammar symbols.");
  }
  return {
    alternative: containing.alternative,
    first,
    last,
    range: { end: last.range.end, start: first.range.start },
    rule: containing.rule,
    selected: intersecting,
    semanticCount: intersecting.length,
    startPosition: semanticPositionOf(containing.alternative.items, first),
  };
};

const selectedNames = (selected: readonly AlternativeItem[]): ReadonlySet<string> => {
  const names = new Set<string>();
  selected.forEach((item) => {
    if (item.kind === "symbol" || item.kind === "parameterized") {
      names.add(item.name);
      if (item.namedReference !== undefined) {
        names.add(item.namedReference.name);
      }
    }
  });
  return names;
};

const renumberAfterSelection = (options: {
  readonly collapseSelectedReferences: boolean;
  readonly context: SelectionContext;
  readonly document: GrammarDocument;
  readonly newSemanticCount: number;
}): readonly TextPatch[] | TransformResult => {
  const patches: TextPatch[] = [];
  const lastPosition = options.context.startPosition + options.context.semanticCount - 1;
  const names = selectedNames(options.context.selected);

  for (const item of options.context.alternative.items) {
    if (item.kind !== "action" || item.range.start < options.context.range.end) {
      continue;
    }
    for (const reference of item.references) {
      if (reference.target.kind === "name" && names.has(reference.target.name)) {
        return failure(
          "cross-boundary-named-reference",
          `Action reference "${reference.target.name}" crosses the transformation boundary.`,
          reference.range,
        );
      }
      if (reference.target.kind !== "index") {
        continue;
      }

      const oldIndex = reference.target.index;
      let newIndex = oldIndex;
      if (oldIndex >= options.context.startPosition && oldIndex <= lastPosition) {
        if (!options.collapseSelectedReferences) {
          return failure(
            "cross-boundary-index-reference",
            `Action reference $${String(oldIndex)} crosses the transformation boundary.`,
            reference.range,
          );
        }
        newIndex = options.context.startPosition;
      } else if (oldIndex > lastPosition) {
        newIndex = oldIndex - options.context.semanticCount + options.newSemanticCount;
      }
      if (newIndex !== oldIndex) {
        const patch = createIndexPatch(options.document.source, reference, newIndex);
        if (patch !== undefined) {
          patches.push(patch);
        }
      }
    }
  }
  return patches;
};

const validateNewRuleName = (
  document: GrammarDocument,
  name: string,
): TransformResult | undefined => {
  if (!VALID_SYMBOL_NAME.test(name)) {
    return failure("invalid-symbol-name", `"${name}" is not a valid rule name.`);
  }
  if (document.rules.some((rule) => rule.name === name)) {
    return failure("duplicate-rule-name", `Rule "${name}" already exists.`);
  }
  return undefined;
};

export const extractRule = (
  document: GrammarDocument,
  selection: SourceRange,
  newRuleName: string,
): TransformResult => {
  const invalidName = validateNewRuleName(document, newRuleName);
  if (invalidName !== undefined) {
    return invalidName;
  }
  const context = selectionContext(document, selection);
  if (isTransformFailure(context)) {
    return context;
  }
  const renumbered = renumberAfterSelection({
    collapseSelectedReferences: false,
    context,
    document,
    newSemanticCount: 1,
  });
  if ("ok" in renumbered) {
    return renumbered;
  }

  const selectedText = document.source.slice(context.range.start, context.range.end);
  const generated = formatNewRuleAlternatives(document, context.rule, newRuleName, [selectedText]);
  return finalizeTransform({
    conflictCheckRecommended: true,
    document,
    patches: [
      { range: context.range, text: newRuleName },
      ...renumbered,
      {
        range: { end: context.rule.range.end, start: context.rule.range.end },
        sequence: 0,
        text: generated,
      },
    ],
    verify: (updated) =>
      updated.rules.some((rule) => rule.name === newRuleName)
        ? undefined
        : {
            code: "extract-postcondition-failed",
            message: "The extracted rule was not present after reparsing.",
          },
  });
};

export type WrapKind = "list" | "option";

export const wrapSelection = (
  document: GrammarDocument,
  selection: SourceRange,
  kind: WrapKind,
  helperName?: string,
): TransformResult => {
  const context = selectionContext(document, selection);
  if (isTransformFailure(context)) {
    return context;
  }
  const needsHelper = document.dialect !== "lrama" || context.semanticCount > 1;
  if (needsHelper && helperName === undefined) {
    return failure(
      "helper-name-required",
      "This selection requires a helper rule name.",
      context.range,
    );
  }
  if (helperName !== undefined) {
    const invalidName = validateNewRuleName(document, helperName);
    if (invalidName !== undefined) {
      return invalidName;
    }
  }
  const generatedHelperName = helperName ?? "";

  const renumbered = renumberAfterSelection({
    collapseSelectedReferences: true,
    context,
    document,
    newSemanticCount: 1,
  });
  if ("ok" in renumbered) {
    return renumbered;
  }

  const selectedText = document.source.slice(context.range.start, context.range.end).trim();
  const replacementTarget = needsHelper ? generatedHelperName : selectedText;
  const replacement =
    document.dialect === "lrama" ? `${kind}(${replacementTarget})` : replacementTarget;
  const patches: TextPatch[] = [{ range: context.range, text: replacement }, ...renumbered];

  if (needsHelper) {
    const alternatives =
      document.dialect === "lrama"
        ? [selectedText]
        : kind === "option"
          ? ["/* empty */", selectedText]
          : ["/* empty */", `${generatedHelperName} ${selectedText}`];
    patches.push({
      range: { end: context.rule.range.end, start: context.rule.range.end },
      sequence: 0,
      text: formatNewRuleAlternatives(document, context.rule, generatedHelperName, alternatives),
    });
  }

  return finalizeTransform({
    conflictCheckRecommended: true,
    document,
    patches,
    verify: (updated) =>
      helperName === undefined || updated.rules.some((rule) => rule.name === helperName)
        ? undefined
        : {
            code: "wrap-postcondition-failed",
            message: "The generated helper rule was not present after reparsing.",
          },
  });
};

interface InlineOptions {
  readonly confirmAction?: boolean;
}

const actionItems = (items: readonly AlternativeItem[]): readonly ActionItem[] =>
  items.filter((item): item is ActionItem => item.kind === "action");

const renderInlineBody = (
  document: GrammarDocument,
  alternative: AlternativeNode,
  callerPosition: number,
): string => {
  const first = alternative.items[0];
  const last = alternative.items.at(-1);
  if (first === undefined || last === undefined) {
    return "";
  }
  const contentRange = { end: last.range.end, start: first.range.start };
  const localPatches: TextPatch[] = [];
  actionItems(alternative.items).forEach((action) => {
    action.references.forEach((reference) => {
      if (reference.target.kind !== "index") {
        return;
      }
      const patch = createIndexPatch(
        document.source,
        reference,
        reference.target.index + callerPosition - 1,
      );
      if (patch !== undefined) {
        localPatches.push({
          range: {
            end: patch.range.end - contentRange.start,
            start: patch.range.start - contentRange.start,
          },
          text: patch.text,
        });
      }
    });
  });
  return applyTextPatches(
    document.source.slice(contentRange.start, contentRange.end),
    localPatches,
  );
};

const mapCallerIndex = (
  index: number,
  occurrences: readonly number[],
  bodyCount: number,
  valueOffset: number,
): number => {
  let shift = 0;
  for (const occurrence of occurrences) {
    if (index < occurrence) {
      break;
    }
    if (index === occurrence) {
      return occurrence + shift + valueOffset;
    }
    shift += bodyCount - 1;
  }
  return index + shift;
};

export const inlineRule = (
  document: GrammarDocument,
  ruleName: string,
  options: InlineOptions = {},
): TransformResult => {
  const resolved = resolveUniqueRule(document, ruleName);
  if (isTransformFailure(resolved)) {
    return resolved;
  }
  if (resolved.parameterized || resolved.alternatives.length !== 1) {
    return failure(
      "inline-rule-not-simple",
      "Only a non-parameterized rule with one alternative can be inlined.",
      resolved.range,
    );
  }
  const body = resolved.alternatives[0];
  if (body === undefined) {
    return failure("inline-rule-empty", "The rule has no alternative.", resolved.range);
  }
  if (
    body.items.some(
      (item) => item.kind === "empty" || item.kind === "precedence" || item.kind === "unknown",
    )
  ) {
    return failure(
      "inline-rule-unsupported-body",
      "Rules with empty, precedence, or unknown items cannot be safely inlined.",
      body.range,
    );
  }
  const actions = actionItems(body.items);
  if (actions.some((action) => action.isMidrule || !action.safe)) {
    return failure(
      "inline-rule-unsafe-action",
      "Rules with midrule or unscannable actions cannot be safely inlined.",
      body.range,
    );
  }
  if (actions.length > 0 && options.confirmAction !== true) {
    return failure(
      "inline-action-confirmation-required",
      "Inlining turns the rule action into a caller action. Confirm this semantic change to continue.",
      actions[0]?.range,
    );
  }

  const bodyCount = body.items.filter(isSemanticItem).length;
  if (bodyCount === 0) {
    return failure("inline-rule-empty", "The rule has no semantic body.", body.range);
  }
  const valueOffset = actions.length > 0 ? bodyCount - 1 : 0;
  const patches: TextPatch[] = [];
  let occurrenceCount = 0;

  for (const caller of document.rules) {
    if (caller.id === resolved.id) {
      continue;
    }
    for (const alternative of caller.alternatives) {
      const occurrences = alternative.items.filter(
        (item) => item.kind === "symbol" && item.name === ruleName,
      );
      if (occurrences.some((item) => item.kind === "symbol" && item.namedReference !== undefined)) {
        return failure(
          "inline-named-reference",
          "A labelled reference cannot be safely expanded into multiple items.",
          occurrences[0]?.range,
        );
      }
      const positions = occurrences.map((item) => semanticPositionOf(alternative.items, item));
      occurrences.forEach((item, index) => {
        const position = positions[index];
        if (position !== undefined) {
          patches.push({
            range: item.range,
            text: renderInlineBody(document, body, position),
          });
          occurrenceCount += 1;
        }
      });

      alternative.items
        .filter((item): item is ActionItem => item.kind === "action")
        .forEach((action) => {
          action.references.forEach((reference) => {
            if (reference.target.kind === "name" && reference.target.name === ruleName) {
              return;
            }
            if (reference.target.kind !== "index") {
              return;
            }
            const mapped = mapCallerIndex(
              reference.target.index,
              positions,
              bodyCount,
              valueOffset,
            );
            if (mapped !== reference.target.index) {
              const patch = createIndexPatch(document.source, reference, mapped);
              if (patch !== undefined) {
                patches.push(patch);
              }
            }
          });
        });
      const namedCrossing = alternative.items.some(
        (item) =>
          item.kind === "action" &&
          item.references.some(
            (reference) => reference.target.kind === "name" && reference.target.name === ruleName,
          ),
      );
      if (namedCrossing && occurrences.length > 0) {
        return failure(
          "inline-named-action-reference",
          `Named action reference "${ruleName}" cannot be mapped after inlining.`,
          alternative.range,
        );
      }
    }
  }

  if (occurrenceCount === 0) {
    return failure("inline-rule-unused", `Rule "${ruleName}" has no references.`);
  }
  patches.push({ range: resolved.range, text: "" });

  return finalizeTransform({
    conflictCheckRecommended: true,
    document,
    patches,
    verify: (updated) =>
      updated.rules.some((rule) => rule.name === ruleName)
        ? {
            code: "inline-postcondition-failed",
            message: "The inlined rule definition remains after reparsing.",
          }
        : undefined,
    warnings:
      actions.length === 0 ? [] : ["The inlined final action is now embedded in each caller."],
  });
};
