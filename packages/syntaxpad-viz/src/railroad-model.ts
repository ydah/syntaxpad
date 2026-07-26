import type { AlternativeItem, RuleNode } from "@syntaxpad/core";

import type { FoldedRecursion, RailroadElement, RailroadLane, RailroadView } from "./types.js";

const toElement = (item: AlternativeItem): RailroadElement => {
  switch (item.kind) {
    case "action":
      return { kind: "action", label: "{…}", range: item.range };
    case "empty":
      return { kind: "empty", label: "ε", range: item.range };
    case "literal":
      return { kind: "terminal", label: item.text, range: item.range };
    case "parameterized": {
      const parameterLabel = item.arguments.map((argument) => argument.name).join(", ");
      const label =
        item.name === "option" || item.name === "ioption"
          ? `[${parameterLabel}]?`
          : item.name === "list" || item.name === "separated_list"
            ? `{${parameterLabel}}*`
            : item.name === "nonempty_list" || item.name === "separated_nonempty_list"
              ? `{${parameterLabel}}+`
              : `${item.name}(${parameterLabel})`;
      return {
        kind: "parameterized",
        label,
        range: item.range,
      };
    }
    case "precedence":
      return {
        kind: "precedence",
        label: `%prec${item.symbol === undefined ? "" : ` ${item.symbol}`}`,
        range: item.range,
      };
    case "symbol":
      return { kind: "nonterminal", label: item.name, range: item.range };
    case "unknown":
      return { kind: "unknown", label: item.text, range: item.range };
  }
};

const foldableItems = (
  items: readonly AlternativeItem[],
): readonly AlternativeItem[] | undefined =>
  items.some(
    (item) =>
      item.kind === "action" ||
      item.kind === "precedence" ||
      item.kind === "unknown" ||
      item.kind === "parameterized",
  )
    ? undefined
    : items.filter((item) => item.kind !== "empty");

const sameItem = (left: AlternativeItem, right: AlternativeItem): boolean => {
  if (left.kind !== right.kind) {
    return false;
  }
  if (left.kind === "symbol" && right.kind === "symbol") {
    return left.name === right.name;
  }
  if (left.kind === "literal" && right.kind === "literal") {
    return left.text === right.text;
  }
  return left.kind === "empty" && right.kind === "empty";
};

const endsWithItems = (
  values: readonly AlternativeItem[],
  suffix: readonly AlternativeItem[],
): boolean => {
  if (suffix.length > values.length) {
    return false;
  }
  const offset = values.length - suffix.length;
  return suffix.every((item, index) => {
    const value = values[offset + index];
    return value !== undefined && sameItem(value, item);
  });
};

const startsWithItems = (
  values: readonly AlternativeItem[],
  prefix: readonly AlternativeItem[],
): boolean =>
  prefix.length <= values.length &&
  prefix.every((item, index) => {
    const value = values[index];
    return value !== undefined && sameItem(value, item);
  });

const findRecursiveShape = (
  rule: RuleNode,
):
  | {
      readonly direction: "left" | "right";
      readonly repeated: readonly AlternativeItem[];
      readonly recursiveRange: RuleNode["range"];
    }
  | undefined => {
  for (const alternative of rule.alternatives) {
    const items = foldableItems(alternative.items);
    if (items === undefined || items.length < 2) {
      continue;
    }
    const first = items[0];
    if (first?.kind === "symbol" && first.name === rule.name) {
      return {
        direction: "left",
        recursiveRange: alternative.range,
        repeated: items.slice(1),
      };
    }
    const last = items.at(-1);
    if (last?.kind === "symbol" && last.name === rule.name) {
      return {
        direction: "right",
        recursiveRange: alternative.range,
        repeated: items.slice(0, -1),
      };
    }
  }
  return undefined;
};

const detectFoldedRecursion = (rule: RuleNode): FoldedRecursion | undefined => {
  if (rule.alternatives.length !== 2) {
    return undefined;
  }
  const recursive = findRecursiveShape(rule);
  if (recursive === undefined) {
    return undefined;
  }
  const recursiveAlternative = rule.alternatives.find(
    (alternative) => alternative.range === recursive.recursiveRange,
  );
  const baseAlternative = rule.alternatives.find(
    (alternative) => alternative !== recursiveAlternative,
  );
  if (baseAlternative === undefined) {
    return undefined;
  }
  const base = foldableItems(baseAlternative.items);
  if (base === undefined) {
    return undefined;
  }

  if (base.length === 0) {
    return {
      direction: recursive.direction,
      item: recursive.repeated.map(toElement),
      optional: true,
      range: rule.range,
      separator: [],
    };
  }

  const matches =
    recursive.direction === "left"
      ? endsWithItems(recursive.repeated, base)
      : startsWithItems(recursive.repeated, base);
  if (!matches) {
    return undefined;
  }
  const separator =
    recursive.direction === "left"
      ? recursive.repeated.slice(0, recursive.repeated.length - base.length)
      : recursive.repeated.slice(base.length);
  return {
    direction: recursive.direction,
    item: base.map(toElement),
    optional: false,
    range: rule.range,
    separator: separator.map(toElement),
  };
};

const toLane = (rule: RuleNode, index: number): RailroadLane => {
  const alternative = rule.alternatives[index];
  if (alternative === undefined) {
    return { elements: [], range: rule.range };
  }
  return {
    elements: alternative.items.map(toElement),
    range: alternative.range,
  };
};

export const createRailroadView = (
  rule: RuleNode,
  options: { readonly foldRecursion?: boolean } = {},
): RailroadView => {
  const lanes = rule.alternatives.map((_, index) => toLane(rule, index));
  const folded = options.foldRecursion === false ? undefined : detectFoldedRecursion(rule);
  const base = { lanes, name: rule.name, ruleId: rule.id };
  return folded === undefined ? base : { ...base, folded };
};

export const detectRecursion = (rule: RuleNode): FoldedRecursion | undefined =>
  detectFoldedRecursion(rule);
