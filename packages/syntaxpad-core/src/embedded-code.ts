import type { ActionReference, ActionReferenceTarget, SourceRange } from "./types.js";

interface EmbeddedCodeScan {
  readonly codeRange: SourceRange;
  readonly end: number;
  readonly references: readonly ActionReference[];
  readonly safe: boolean;
  readonly terminated: boolean;
}

const isIdentifierStart = (character: string | undefined): boolean =>
  character !== undefined && /[A-Za-z_]/u.test(character);

const isIdentifierPart = (character: string | undefined): boolean =>
  character !== undefined && /[A-Za-z0-9_.-]/u.test(character);

const isDigit = (character: string | undefined): boolean =>
  character !== undefined && /[0-9]/u.test(character);

const scanQuoted = (source: string, start: number, quote: "'" | '"'): number => {
  let cursor = start + 1;

  while (cursor < source.length) {
    const character = source[cursor];
    if (character === "\\") {
      cursor += source[cursor + 1] === "\r" && source[cursor + 2] === "\n" ? 3 : 2;
      continue;
    }
    cursor += 1;
    if (character === quote) {
      return cursor;
    }
  }

  return source.length;
};

const scanRawString = (source: string, start: number): number | undefined => {
  const prefixes = ['R"', 'u8R"', 'uR"', 'UR"', 'LR"'];
  const prefix = prefixes.find((candidate) => source.startsWith(candidate, start));
  if (prefix === undefined) {
    return undefined;
  }

  const delimiterStart = start + prefix.length;
  const open = source.indexOf("(", delimiterStart);
  if (open < 0 || open - delimiterStart > 16) {
    return undefined;
  }

  const delimiter = source.slice(delimiterStart, open);
  if (/[\s()\\]/u.test(delimiter)) {
    return undefined;
  }

  const close = source.indexOf(`)${delimiter}"`, open + 1);
  return close < 0 ? source.length : close + delimiter.length + 2;
};

const scanLineComment = (source: string, start: number): number => {
  const newline = source.indexOf("\n", start + 2);
  return newline < 0 ? source.length : newline;
};

const scanBlockComment = (source: string, start: number): number => {
  const close = source.indexOf("*/", start + 2);
  return close < 0 ? source.length : close + 2;
};

const scanPreprocessorLine = (source: string, start: number): number => {
  let cursor = start;

  while (cursor < source.length) {
    const newline = source.indexOf("\n", cursor);
    if (newline < 0) {
      return source.length;
    }

    let previous = newline - 1;
    if (source[previous] === "\r") {
      previous -= 1;
    }
    if (source[previous] !== "\\") {
      return newline + 1;
    }
    cursor = newline + 1;
  }

  return source.length;
};

const parseTarget = (
  source: string,
  cursor: number,
): { readonly end: number; readonly target: ActionReferenceTarget } | undefined => {
  const character = source[cursor];

  if (character === "$") {
    return { end: cursor + 1, target: { kind: "result" } };
  }

  if (isDigit(character)) {
    let end = cursor + 1;
    while (isDigit(source[end])) {
      end += 1;
    }
    return {
      end,
      target: { index: Number.parseInt(source.slice(cursor, end), 10), kind: "index" },
    };
  }

  if (character === "[") {
    const close = source.indexOf("]", cursor + 1);
    if (close < 0) {
      return undefined;
    }
    const name = source.slice(cursor + 1, close);
    if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/u.test(name)) {
      return undefined;
    }
    return { end: close + 1, target: { kind: "name", name } };
  }

  if (!isIdentifierStart(character)) {
    return undefined;
  }

  let end = cursor + 1;
  while (isIdentifierPart(source[end])) {
    end += 1;
  }
  return { end, target: { kind: "name", name: source.slice(cursor, end) } };
};

const parseActionReference = (
  source: string,
  start: number,
): { readonly end: number; readonly reference: ActionReference } | undefined => {
  const sigil = source[start];
  if (sigil !== "$" && sigil !== "@") {
    return undefined;
  }

  let cursor = start + 1;
  let typeTag: string | undefined;
  if (source[cursor] === "<") {
    const close = source.indexOf(">", cursor + 1);
    if (close < 0) {
      return undefined;
    }
    typeTag = source.slice(cursor + 1, close);
    cursor = close + 1;
  }

  const parsed = parseTarget(source, cursor);
  if (parsed === undefined) {
    return undefined;
  }

  const base = {
    kind: sigil === "$" ? ("value" as const) : ("location" as const),
    range: { end: parsed.end, start },
    target: parsed.target,
  };
  const reference: ActionReference = typeTag === undefined ? base : { ...base, typeTag };
  return { end: parsed.end, reference };
};

const isPreprocessorStart = (source: string, cursor: number, lineStart: number): boolean => {
  if (source[cursor] !== "#") {
    return false;
  }
  return /^[\t ]*$/u.test(source.slice(lineStart, cursor));
};

export const scanEmbeddedCode = (source: string, start: number): EmbeddedCodeScan => {
  if (source[start] !== "{") {
    return {
      codeRange: { end: start, start },
      end: start,
      references: [],
      safe: false,
      terminated: false,
    };
  }

  const references: ActionReference[] = [];
  let cursor = start + 1;
  let depth = 1;
  let lineStart = source.lastIndexOf("\n", start - 1) + 1;

  while (cursor < source.length) {
    const character = source[cursor];
    const next = source[cursor + 1];

    if (character === "\n") {
      lineStart = cursor + 1;
      cursor += 1;
      continue;
    }
    if (character === "/" && next === "/") {
      cursor = scanLineComment(source, cursor);
      continue;
    }
    if (character === "/" && next === "*") {
      cursor = scanBlockComment(source, cursor);
      continue;
    }
    if (character === "'" || character === '"') {
      cursor = scanQuoted(source, cursor, character);
      continue;
    }
    const rawStringEnd = scanRawString(source, cursor);
    if (rawStringEnd !== undefined) {
      cursor = rawStringEnd;
      continue;
    }
    if (isPreprocessorStart(source, cursor, lineStart)) {
      cursor = scanPreprocessorLine(source, cursor);
      lineStart = cursor;
      continue;
    }
    if (character === "{") {
      depth += 1;
      cursor += 1;
      continue;
    }
    if (character === "}") {
      depth -= 1;
      cursor += 1;
      if (depth === 0) {
        return {
          codeRange: { end: cursor - 1, start: start + 1 },
          end: cursor,
          references,
          safe: true,
          terminated: true,
        };
      }
      continue;
    }
    if (character === "$" || character === "@") {
      const parsed = parseActionReference(source, cursor);
      if (parsed !== undefined) {
        references.push(parsed.reference);
        cursor = parsed.end;
        continue;
      }
    }
    cursor += 1;
  }

  return {
    codeRange: { end: source.length, start: start + 1 },
    end: source.length,
    references,
    safe: false,
    terminated: false,
  };
};
