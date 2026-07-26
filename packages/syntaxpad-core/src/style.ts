import { lineStartAt } from "./grammar-lex.js";
import type { GrammarDocument, RuleNode } from "./types.js";

export interface RuleStyle {
  readonly alternativePrefix: string;
  readonly indent: string;
  readonly newline: "\n" | "\r\n";
  readonly ruleSeparator: string;
  readonly semicolonPrefix: string;
}

const leadingWhitespace = (value: string): string => /^[\t ]*/u.exec(value)?.[0] ?? "";

export const inferRuleStyle = (document: GrammarDocument, rule: RuleNode): RuleStyle => {
  const indent = leadingWhitespace(
    document.source.slice(lineStartAt(document.source, rule.range.start), rule.range.start),
  );
  const secondAlternative = rule.alternatives[1];
  let alternativePrefix = `${document.newline}${indent}  | `;
  if (secondAlternative?.separatorRange !== undefined) {
    const lineStart = lineStartAt(document.source, secondAlternative.separatorRange.start);
    const beforePipe = document.source.slice(lineStart, secondAlternative.separatorRange.start);
    const afterPipe = document.source.slice(
      secondAlternative.separatorRange.end,
      secondAlternative.range.start,
    );
    alternativePrefix = `${beforePipe}|${afterPipe}`;
    if (!alternativePrefix.includes(document.newline)) {
      alternativePrefix = `${document.newline}${indent}  | `;
    }
  }

  const semicolonPrefix =
    rule.semicolonRange === undefined
      ? `${document.newline}${indent}  `
      : document.source.slice(
          rule.alternatives.at(-1)?.range.end ?? rule.colonRange.end,
          rule.semicolonRange.start,
        );
  const normalizedSemicolonPrefix = semicolonPrefix.includes(document.newline)
    ? semicolonPrefix
    : `${document.newline}${indent}  `;

  return {
    alternativePrefix,
    indent,
    newline: document.newline,
    ruleSeparator: `${document.newline}${document.newline}`,
    semicolonPrefix: normalizedSemicolonPrefix,
  };
};

export const formatNewRule = (
  document: GrammarDocument,
  sourceRule: RuleNode,
  name: string,
  body: string,
): string => formatNewRuleAlternatives(document, sourceRule, name, [body]);

export const formatNewRuleAlternatives = (
  document: GrammarDocument,
  sourceRule: RuleNode,
  name: string,
  alternatives: readonly string[],
): string => {
  const style = inferRuleStyle(document, sourceRule);
  const body = alternatives
    .map((alternative, index) =>
      index === 0
        ? `${style.indent}    ${alternative.trim()}`
        : `${style.indent}  | ${alternative.trim()}`,
    )
    .join(style.newline);
  return `${style.ruleSeparator}${style.indent}${name}:${style.newline}${body}${style.newline}${style.indent}  ;`;
};
