import { scanEmbeddedCode } from "./embedded-code.js";
import { readIdentifier, scanComment, scanQuotedLiteral, skipTrivia } from "./grammar-lex.js";
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

const parseItemSuffix = (
  source: string,
  start: number,
  limit: number,
): {
  readonly end: number;
  readonly namedReference?: NamedReference;
  readonly typeTag?: string;
} => {
  let cursor = skipTrivia(source, start, limit);
  let end = start;
  const namedReference = parseNamedReference(source, cursor, limit);
  if (namedReference !== undefined) {
    end = namedReference.range.end;
    cursor = skipTrivia(source, namedReference.range.end, limit);
  }
  let typeTag: string | undefined;
  if (source[cursor] === "<") {
    const close = source.indexOf(">", cursor + 1);
    if (close >= 0 && close < limit) {
      typeTag = source.slice(cursor + 1, close);
      end = close + 1;
    }
  }
  return {
    end,
    ...(namedReference === undefined ? {} : { namedReference }),
    ...(typeTag === undefined ? {} : { typeTag }),
  };
};

const scanParenthesized = (source: string, start: number, limit: number): number => {
  let cursor = start + 1;
  let depth = 1;
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
    const commentEnd = scanComment(source, cursor, range.end);
    if (commentEnd !== undefined) {
      cursor = commentEnd;
      continue;
    }
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
      const suffix = parseItemSuffix(source, itemEnd, range.end);
      const action: ActionItem = {
        codeRange: {
          end: Math.min(scanned.codeRange.end, range.end),
          start: scanned.codeRange.start,
        },
        isMidrule: false,
        kind: "action",
        range: { end: suffix.end, start: cursor },
        references: scanned.references.filter((reference) => reference.range.end <= range.end),
        safe: scanned.safe && scanned.end <= range.end,
        semanticPosition: semanticPosition + 1,
        terminated: scanned.terminated && scanned.end <= range.end,
      };
      items.push({
        ...action,
        ...(suffix.namedReference === undefined ? {} : { namedReference: suffix.namedReference }),
        ...(suffix.typeTag === undefined ? {} : { typeTag: suffix.typeTag }),
      });
      semanticPosition += 1;
      if (!action.terminated) {
        diagnostics.push({
          code: "unterminated-action",
          message: "Action block is not terminated before the end of the rules section.",
          range: action.range,
          severity: "error",
        });
      }
      cursor = suffix.end;
      continue;
    }

    if (source[cursor] === "'" || source[cursor] === '"') {
      const literalEnd = scanQuotedLiteral(source, cursor, range.end);
      const suffix = parseItemSuffix(source, literalEnd, range.end);
      const item = {
        kind: "literal",
        range: { end: suffix.end, start: cursor },
        text: source.slice(cursor, literalEnd),
      } as const;
      items.push(
        suffix.namedReference === undefined
          ? item
          : { ...item, namedReference: suffix.namedReference },
      );
      semanticPosition += 1;
      cursor = suffix.end;
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
        const suffix = parseItemSuffix(source, endOfCall, range.end);
        const node = {
          arguments: extractParameterArguments(source, {
            end: Math.max(afterName + 1, endOfCall - 1),
            start: afterName + 1,
          }),
          kind: "parameterized" as const,
          name: identifier.value,
          nameRange: { end: identifier.end, start: cursor },
          range: { end: suffix.end, start: cursor },
        };
        items.push(
          suffix.namedReference === undefined
            ? node
            : { ...node, namedReference: suffix.namedReference },
        );
        semanticPosition += 1;
        cursor = suffix.end;
        continue;
      }

      const suffix = parseItemSuffix(source, identifier.end, range.end);
      const node = {
        kind: "symbol" as const,
        name: identifier.value,
        nameRange: { end: identifier.end, start: cursor },
        range: { end: suffix.end, start: cursor },
      };
      items.push(
        suffix.namedReference === undefined
          ? node
          : { ...node, namedReference: suffix.namedReference },
      );
      semanticPosition += 1;
      cursor = suffix.end;
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
