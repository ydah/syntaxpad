import { finalizeTransform } from "./patches.js";
import { failure, isTransformFailure, resolveUniqueRule } from "./refactor-shared.js";
import { inferRuleStyle } from "./style.js";
import type { GrammarDocument, TransformResult } from "./types.js";

export const addAlternative = (document: GrammarDocument, ruleName: string): TransformResult => {
  const resolved = resolveUniqueRule(document, ruleName);
  if (isTransformFailure(resolved)) {
    return resolved;
  }
  if (resolved.semicolonRange === undefined) {
    return failure(
      "missing-rule-semicolon",
      `Rule "${ruleName}" must be terminated before adding an alternative.`,
      resolved.range,
    );
  }
  const style = inferRuleStyle(document, resolved);
  return finalizeTransform({
    document,
    patches: [
      {
        range: {
          end: resolved.semicolonRange.start,
          start: resolved.semicolonRange.start,
        },
        text: `${style.alternativePrefix}/* TODO */`,
      },
    ],
    verify: (updated) => {
      const updatedRule = updated.rules.find((rule) => rule.name === ruleName);
      return updatedRule?.alternatives.length === resolved.alternatives.length + 1
        ? undefined
        : {
            code: "add-alternative-postcondition-failed",
            message: "The new alternative could not be verified.",
          };
    },
  });
};

const trimmedContent = (source: string, start: number, end: number): string =>
  source.slice(start, end).trim();

export const reorderAlternatives = (
  document: GrammarDocument,
  ruleName: string,
  fromIndex: number,
  toIndex: number,
): TransformResult => {
  const resolved = resolveUniqueRule(document, ruleName);
  if (isTransformFailure(resolved)) {
    return resolved;
  }
  const count = resolved.alternatives.length;
  if (
    fromIndex < 0 ||
    fromIndex >= count ||
    toIndex < 0 ||
    toIndex >= count ||
    fromIndex === toIndex
  ) {
    return failure(
      "invalid-alternative-order",
      "Alternative indices must be distinct and within the rule.",
      resolved.range,
    );
  }

  const order = Array.from({ length: count }, (_, index) => index);
  const [moved] = order.splice(fromIndex, 1);
  if (moved === undefined) {
    return failure("invalid-alternative-order", "The source alternative does not exist.");
  }
  order.splice(toIndex, 0, moved);

  const contents = resolved.alternatives.map((alternative) =>
    trimmedContent(document.source, alternative.range.start, alternative.range.end),
  );
  const slots = resolved.alternatives.map((alternative) => {
    const raw = document.source.slice(alternative.range.start, alternative.range.end);
    return {
      leading: /^\s*/u.exec(raw)?.[0] ?? "",
      trailing: /\s*$/u.exec(raw)?.[0] ?? "",
    };
  });
  const replacement = order
    .map((contentIndex, slotIndex) => {
      const slot = slots[slotIndex];
      const content = contents[contentIndex];
      if (slot === undefined || content === undefined) {
        return "";
      }
      return `${slot.leading}${content}${slot.trailing}`;
    })
    .join("|");
  const first = resolved.alternatives[0];
  const last = resolved.alternatives.at(-1);
  if (first === undefined || last === undefined) {
    return failure("empty-rule", `Rule "${ruleName}" has no alternatives.`);
  }

  return finalizeTransform({
    document,
    patches: [{ range: { end: last.range.end, start: first.range.start }, text: replacement }],
    verify: (updated) =>
      updated.rules.find((rule) => rule.name === ruleName)?.alternatives.length === count
        ? undefined
        : {
            code: "reorder-postcondition-failed",
            message: "The reordered alternatives could not be verified.",
          },
  });
};
