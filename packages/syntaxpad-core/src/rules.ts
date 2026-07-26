import {
  lineStartAt,
  readIdentifier,
  scanComment,
  scanQuotedLiteral,
  skipTrivia,
} from "./grammar-lex.js";
import { scanEmbeddedCode } from "./embedded-code.js";
import { parseAlternativeItems } from "./rule-items.js";
import type {
  AlternativeNode,
  GrammarDiagnostic,
  ParameterArgument,
  RuleNode,
  SourceRange,
  UnknownNode,
} from "./types.js";

interface HeaderParse {
  readonly colonRange: SourceRange;
  readonly headRange: SourceRange;
  readonly inline: boolean;
  readonly name: string;
  readonly nameRange: SourceRange;
  readonly parameterNames: readonly ParameterArgument[];
  readonly parameterized: boolean;
}

interface RuleParse {
  readonly diagnostics: readonly GrammarDiagnostic[];
  readonly rules: readonly RuleNode[];
  readonly unknown: readonly UnknownNode[];
}

interface BodySplit {
  readonly alternatives: readonly {
    readonly range: SourceRange;
    readonly separatorRange?: SourceRange;
  }[];
  readonly end: number;
  readonly semicolonRange?: SourceRange;
}

const hasTokenBoundary = (source: string, end: number): boolean =>
  !/[A-Za-z0-9_-]/u.test(source[end] ?? "");

const consumeKeyword = (
  source: string,
  start: number,
  keyword: string,
  limit: number,
): number | undefined => {
  const end = start + keyword.length;
  if (end > limit || !source.startsWith(keyword, start) || !hasTokenBoundary(source, end)) {
    return undefined;
  }
  return end;
};

const parseParameters = (
  source: string,
  start: number,
  limit: number,
): { readonly end: number; readonly parameters: readonly ParameterArgument[] } | undefined => {
  if (source[start] !== "(") {
    return undefined;
  }
  const parameters: ParameterArgument[] = [];
  let cursor = start + 1;
  while (cursor < limit) {
    cursor = skipTrivia(source, cursor, limit);
    if (source[cursor] === ")") {
      return { end: cursor + 1, parameters };
    }
    const parameter = readIdentifier(source, cursor, limit);
    if (parameter === undefined) {
      return undefined;
    }
    parameters.push({
      name: parameter.value,
      range: { end: parameter.end, start: cursor },
    });
    cursor = skipTrivia(source, parameter.end, limit);
    if (source[cursor] === ",") {
      cursor += 1;
      continue;
    }
    if (source[cursor] !== ")") {
      return undefined;
    }
  }
  return undefined;
};

const isLineHeaderPosition = (source: string, start: number): boolean =>
  /^[\t ]*$/u.test(source.slice(lineStartAt(source, start), start));

const parseHeader = (source: string, start: number, limit: number): HeaderParse | undefined => {
  if (!isLineHeaderPosition(source, start)) {
    return undefined;
  }

  let cursor = start;
  let parameterized = false;
  let inline = false;
  const ruleKeywordEnd = consumeKeyword(source, cursor, "%rule", limit);
  if (ruleKeywordEnd !== undefined) {
    parameterized = true;
    cursor = skipTrivia(source, ruleKeywordEnd, limit);
  }

  const inlineKeywordEnd = consumeKeyword(source, cursor, "%inline", limit);
  if (inlineKeywordEnd !== undefined) {
    inline = true;
    cursor = skipTrivia(source, inlineKeywordEnd, limit);
  }

  const nameStart = cursor;
  const name = readIdentifier(source, nameStart, limit);
  if (name === undefined) {
    return undefined;
  }
  cursor = skipTrivia(source, name.end, limit);

  let parameterNames: readonly ParameterArgument[] = [];
  const parameters = parseParameters(source, cursor, limit);
  if (parameters !== undefined) {
    parameterized = true;
    parameterNames = parameters.parameters;
    cursor = skipTrivia(source, parameters.end, limit);
  }

  if (source[cursor] !== ":") {
    return undefined;
  }

  return {
    colonRange: { end: cursor + 1, start: cursor },
    headRange: { end: cursor, start },
    inline,
    name: name.value,
    nameRange: { end: name.end, start: nameStart },
    parameterNames,
    parameterized,
  };
};

const splitRuleBody = (source: string, start: number, limit: number): BodySplit => {
  const alternatives: {
    range: SourceRange;
    separatorRange?: SourceRange;
  }[] = [];
  let cursor = start;
  let alternativeStart = start;
  let separatorRange: SourceRange | undefined;
  let parentheses = 0;
  let brackets = 0;

  while (cursor < limit) {
    const commentEnd = scanComment(source, cursor, limit);
    if (commentEnd !== undefined) {
      cursor = commentEnd;
      continue;
    }
    if (source[cursor] === "'" || source[cursor] === '"') {
      cursor = scanQuotedLiteral(source, cursor, limit);
      continue;
    }
    if (source[cursor] === "{") {
      const action = scanEmbeddedCode(source, cursor);
      if (!action.terminated || action.end > limit) {
        const ruleEnd = /(?:^|\n)[\t ]*(;)/gmu;
        ruleEnd.lastIndex = cursor + 1;
        const recovery = ruleEnd.exec(source);
        if (recovery?.index !== undefined && recovery.index < limit) {
          cursor = recovery.index + recovery[0].lastIndexOf(";");
          continue;
        }
      }
      cursor = Math.min(action.end, limit);
      continue;
    }
    if (source[cursor] === "(") {
      parentheses += 1;
      cursor += 1;
      continue;
    }
    if (source[cursor] === ")") {
      parentheses = Math.max(0, parentheses - 1);
      cursor += 1;
      continue;
    }
    if (source[cursor] === "[") {
      brackets += 1;
      cursor += 1;
      continue;
    }
    if (source[cursor] === "]") {
      brackets = Math.max(0, brackets - 1);
      cursor += 1;
      continue;
    }

    const atTopLevel = parentheses === 0 && brackets === 0;
    if (atTopLevel && (source[cursor] === "|" || source[cursor] === ";")) {
      const entry = { range: { end: cursor, start: alternativeStart } };
      alternatives.push(separatorRange === undefined ? entry : { ...entry, separatorRange });
      if (source[cursor] === ";") {
        return {
          alternatives,
          end: cursor + 1,
          semicolonRange: { end: cursor + 1, start: cursor },
        };
      }
      separatorRange = { end: cursor + 1, start: cursor };
      alternativeStart = cursor + 1;
    }
    cursor += 1;
  }

  const entry = { range: { end: limit, start: alternativeStart } };
  alternatives.push(separatorRange === undefined ? entry : { ...entry, separatorRange });
  return { alternatives, end: limit };
};

const hasNonTrivia = (source: string, range: SourceRange): boolean =>
  skipTrivia(source, range.start, range.end) < range.end;

export const parseRules = (source: string, range: SourceRange): RuleParse => {
  const rules: RuleNode[] = [];
  const diagnostics: GrammarDiagnostic[] = [];
  const unknown: UnknownNode[] = [];
  let cursor = range.start;
  let unknownStart = cursor;

  while (cursor < range.end) {
    const candidate = skipTrivia(source, cursor, range.end);
    const header = parseHeader(source, candidate, range.end);
    if (header === undefined) {
      const commentEnd = scanComment(source, cursor, range.end);
      if (commentEnd !== undefined) {
        cursor = commentEnd;
      } else if (source[cursor] === "'" || source[cursor] === '"') {
        cursor = scanQuotedLiteral(source, cursor, range.end);
      } else {
        cursor += 1;
      }
      continue;
    }

    if (hasNonTrivia(source, { end: candidate, start: unknownStart })) {
      unknown.push({ context: "rule", range: { end: candidate, start: unknownStart } });
    }

    const body = splitRuleBody(source, header.colonRange.end, range.end);
    const alternatives: AlternativeNode[] = body.alternatives.map((alternative, index) => {
      const parsed = parseAlternativeItems(source, alternative.range);
      diagnostics.push(...parsed.diagnostics);
      const base = { index, items: parsed.items, range: alternative.range };
      return alternative.separatorRange === undefined
        ? base
        : { ...base, separatorRange: alternative.separatorRange };
    });
    if (body.semicolonRange === undefined) {
      diagnostics.push({
        code: "missing-rule-semicolon",
        message: `Rule "${header.name}" has no terminating semicolon.`,
        range: { end: body.end, start: header.colonRange.start },
        severity: "error",
      });
    }

    const baseRule = {
      alternatives,
      colonRange: header.colonRange,
      headRange: header.headRange,
      id: `${header.name}:${String(header.nameRange.start)}`,
      inline: header.inline,
      name: header.name,
      nameRange: header.nameRange,
      parameterNames: header.parameterNames,
      parameterized: header.parameterized,
      range: { end: body.end, start: candidate },
    };
    rules.push(
      body.semicolonRange === undefined
        ? baseRule
        : { ...baseRule, semicolonRange: body.semicolonRange },
    );
    cursor = body.end;
    unknownStart = cursor;
  }

  if (hasNonTrivia(source, { end: range.end, start: unknownStart })) {
    unknown.push({ context: "rule", range: { end: range.end, start: unknownStart } });
  }

  return { diagnostics, rules, unknown };
};
