import { scanEmbeddedCode } from "./embedded-code.js";
import { readIdentifier, scanQuotedLiteral, skipTrivia } from "./grammar-lex.js";
import type {
  ActionItem,
  AlternativeItem,
  GrammarDiagnostic,
  NamedReference,
  ParameterArgument,
  SourceRange,
} from "./types.js";

interface ParsedItems {
  readonly diagnostics: readonly GrammarDiagnostic[];
  readonly items: readonly AlternativeItem[];
}

const parseNamedReference = (
  source: string,
  start: number,
  limit: number,
): NamedReference | undefined => {
  if (source[start] !== "[") {
    return undefined;
  }
  const nameStart = skipTrivia(source, start + 1, limit);
  const identifier = readIdentifier(source, nameStart, limit);
  if (identifier === undefined) {
    return undefined;
  }
  const close = skipTrivia(source, identifier.end, limit);
  if (source[close] !== "]") {
    return undefined;
  }
  return { name: identifier.value, range: { end: close + 1, start } };
};

const scanParenthesized = (source: string, start: number, limit: number): number => {
  let cursor = start + 1;
  let depth = 1;
  while (cursor < limit) {
    if (source[cursor] === "'" || source[cursor] === '"') {
      cursor = scanQuotedLiteral(source, cursor, limit);
      continue;
    }
    if (source[cursor] === "(") {
      depth += 1;
    } else if (source[cursor] === ")") {
      depth -= 1;
      if (depth === 0) {
        return cursor + 1;
      }
    }
    cursor += 1;
  }
  return limit;
};

const extractParameterArguments = (
  source: string,
  range: SourceRange,
): readonly ParameterArgument[] => {
  const arguments_: ParameterArgument[] = [];
  let cursor = range.start;
  while (cursor < range.end) {
    if (source[cursor] === "'" || source[cursor] === '"') {
      cursor = scanQuotedLiteral(source, cursor, range.end);
      continue;
    }
    const identifier = readIdentifier(source, cursor, range.end);
    if (identifier === undefined) {
      cursor += 1;
      continue;
    }
    arguments_.push({
      name: identifier.value,
      range: { end: identifier.end, start: cursor },
    });
    cursor = identifier.end;
  }
  return arguments_;
};

const parseDirectiveItem = (
  source: string,
  start: number,
  limit: number,
): { readonly end: number; readonly item: AlternativeItem } => {
  if (source.startsWith("%empty", start)) {
    const end = start + "%empty".length;
    return { end, item: { kind: "empty", range: { end, start } } };
  }

  if (source.startsWith("%prec", start)) {
    const argumentStart = skipTrivia(source, start + "%prec".length, limit);
    if (source[argumentStart] === "'" || source[argumentStart] === '"') {
      const end = scanQuotedLiteral(source, argumentStart, limit);
      return {
        end,
        item: {
          kind: "precedence",
          range: { end, start },
          symbol: source.slice(argumentStart, end),
          symbolRange: { end, start: argumentStart },
        },
      };
    }
    const identifier = readIdentifier(source, argumentStart, limit);
    if (identifier !== undefined) {
      return {
        end: identifier.end,
        item: {
          kind: "precedence",
          range: { end: identifier.end, start },
          symbol: identifier.value,
          symbolRange: { end: identifier.end, start: argumentStart },
        },
      };
    }
    const end = start + "%prec".length;
    return { end, item: { kind: "precedence", range: { end, start } } };
  }

  let end = start + 1;
  while (end < limit && /[A-Za-z0-9_-]/u.test(source[end] ?? "")) {
    end += 1;
  }
  return {
    end,
    item: { kind: "unknown", range: { end, start }, text: source.slice(start, end) },
  };
};

const markMidruleActions = (items: readonly AlternativeItem[]): readonly AlternativeItem[] =>
  items.map((item, index) => {
    if (item.kind !== "action") {
      return item;
    }
    const isMidrule = items
      .slice(index + 1)
      .some((candidate) =>
        ["action", "literal", "parameterized", "symbol"].includes(candidate.kind),
      );
    return { ...item, isMidrule };
  });

export const parseAlternativeItems = (source: string, range: SourceRange): ParsedItems => {
  const items: AlternativeItem[] = [];
  const diagnostics: GrammarDiagnostic[] = [];
  let cursor = range.start;
  let semanticPosition = 0;

  while (cursor < range.end) {
    cursor = skipTrivia(source, cursor, range.end);
    if (cursor >= range.end) {
      break;
    }

    if (source[cursor] === "{") {
      const scanned = scanEmbeddedCode(source, cursor);
      const itemEnd = Math.min(scanned.end, range.end);
      const action: ActionItem = {
        codeRange: {
          end: Math.min(scanned.codeRange.end, range.end),
          start: scanned.codeRange.start,
        },
        isMidrule: false,
        kind: "action",
        range: { end: itemEnd, start: cursor },
        references: scanned.references.filter((reference) => reference.range.end <= range.end),
        safe: scanned.safe && scanned.end <= range.end,
        semanticPosition: semanticPosition + 1,
        terminated: scanned.terminated && scanned.end <= range.end,
      };
      items.push(action);
      semanticPosition += 1;
      if (!action.terminated) {
        diagnostics.push({
          code: "unterminated-action",
          message: "Action block is not terminated before the end of the rules section.",
          range: action.range,
          severity: "error",
        });
      }
      cursor = itemEnd;
      continue;
    }

    if (source[cursor] === "'" || source[cursor] === '"') {
      const end = scanQuotedLiteral(source, cursor, range.end);
      items.push({
        kind: "literal",
        range: { end, start: cursor },
        text: source.slice(cursor, end),
      });
      semanticPosition += 1;
      cursor = end;
      continue;
    }

    if (source[cursor] === "%") {
      const parsed = parseDirectiveItem(source, cursor, range.end);
      items.push(parsed.item);
      cursor = parsed.end;
      continue;
    }

    const identifier = readIdentifier(source, cursor, range.end);
    if (identifier !== undefined) {
      const afterName = skipTrivia(source, identifier.end, range.end);
      if (source[afterName] === "(") {
        const endOfCall = scanParenthesized(source, afterName, range.end);
        const afterCall = skipTrivia(source, endOfCall, range.end);
        const namedReference = parseNamedReference(source, afterCall, range.end);
        const end = namedReference?.range.end ?? endOfCall;
        const node = {
          arguments: extractParameterArguments(source, {
            end: Math.max(afterName + 1, endOfCall - 1),
            start: afterName + 1,
          }),
          kind: "parameterized" as const,
          name: identifier.value,
          nameRange: { end: identifier.end, start: cursor },
          range: { end, start: cursor },
        };
        items.push(namedReference === undefined ? node : { ...node, namedReference });
        semanticPosition += 1;
        cursor = end;
        continue;
      }

      const namedReference = parseNamedReference(source, afterName, range.end);
      const end = namedReference?.range.end ?? identifier.end;
      const node = {
        kind: "symbol" as const,
        name: identifier.value,
        nameRange: { end: identifier.end, start: cursor },
        range: { end, start: cursor },
      };
      items.push(namedReference === undefined ? node : { ...node, namedReference });
      semanticPosition += 1;
      cursor = end;
      continue;
    }

    const end = cursor + 1;
    items.push({
      kind: "unknown",
      range: { end, start: cursor },
      text: source.slice(cursor, end),
    });
    cursor = end;
  }

  return { diagnostics, items: markMidruleActions(items) };
};
