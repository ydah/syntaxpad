import { scanEmbeddedCode } from "./embedded-code.js";
import type { SourceRange } from "./types.js";

const RAW_PREFIXES = ['R"', 'u8R"', 'uR"', 'UR"', 'LR"'] as const;

export const isIdentifierStart = (character: string | undefined): boolean =>
  character !== undefined && /[A-Za-z_.]/u.test(character);

export const isIdentifierPart = (character: string | undefined): boolean =>
  character !== undefined && /[A-Za-z0-9_.-]/u.test(character);

export const scanQuotedLiteral = (source: string, start: number, limit = source.length): number => {
  const quote = source[start];
  if (quote !== "'" && quote !== '"') {
    return start;
  }

  let cursor = start + 1;
  while (cursor < limit) {
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
  return limit;
};

export const scanRawStringLiteral = (
  source: string,
  start: number,
  limit = source.length,
): number | undefined => {
  const prefix = RAW_PREFIXES.find((candidate) => source.startsWith(candidate, start));
  if (prefix === undefined) {
    return undefined;
  }
  const delimiterStart = start + prefix.length;
  const open = source.indexOf("(", delimiterStart);
  if (open < 0 || open >= limit || open - delimiterStart > 16) {
    return undefined;
  }
  const delimiter = source.slice(delimiterStart, open);
  if (/[\s()\\]/u.test(delimiter)) {
    return undefined;
  }
  const marker = `)${delimiter}"`;
  const close = source.indexOf(marker, open + 1);
  return close < 0 || close >= limit ? limit : close + marker.length;
};

export const scanComment = (
  source: string,
  start: number,
  limit = source.length,
): number | undefined => {
  if (source.startsWith("//", start)) {
    const newline = source.indexOf("\n", start + 2);
    return newline < 0 || newline >= limit ? limit : newline;
  }
  if (source.startsWith("/*", start)) {
    const close = source.indexOf("*/", start + 2);
    return close < 0 || close >= limit ? limit : close + 2;
  }
  return undefined;
};

export const skipTrivia = (source: string, start: number, limit = source.length): number => {
  let cursor = start;
  while (cursor < limit) {
    if (/\s/u.test(source[cursor] ?? "")) {
      cursor += 1;
      continue;
    }
    const commentEnd = scanComment(source, cursor, limit);
    if (commentEnd !== undefined) {
      cursor = commentEnd;
      continue;
    }
    break;
  }
  return cursor;
};

const skipPercentBlock = (source: string, start: number): number => {
  let cursor = start + 2;
  while (cursor < source.length) {
    if (source.startsWith("%}", cursor)) {
      return cursor + 2;
    }
    const commentEnd = scanComment(source, cursor);
    if (commentEnd !== undefined) {
      cursor = commentEnd;
      continue;
    }
    const rawEnd = scanRawStringLiteral(source, cursor);
    if (rawEnd !== undefined) {
      cursor = rawEnd;
      continue;
    }
    if (source[cursor] === "'" || source[cursor] === '"') {
      cursor = scanQuotedLiteral(source, cursor);
      continue;
    }
    cursor += 1;
  }
  return source.length;
};

export const findSectionDelimiters = (source: string): readonly SourceRange[] => {
  const delimiters: SourceRange[] = [];
  let cursor = 0;

  while (cursor < source.length && delimiters.length < 2) {
    const commentEnd = scanComment(source, cursor);
    if (commentEnd !== undefined) {
      cursor = commentEnd;
      continue;
    }
    if (source.startsWith("%{", cursor)) {
      cursor = skipPercentBlock(source, cursor);
      continue;
    }
    if (source.startsWith("%%", cursor)) {
      delimiters.push({ end: cursor + 2, start: cursor });
      cursor += 2;
      continue;
    }
    const rawEnd = scanRawStringLiteral(source, cursor);
    if (rawEnd !== undefined) {
      cursor = rawEnd;
      continue;
    }
    if (source[cursor] === "'" || source[cursor] === '"') {
      cursor = scanQuotedLiteral(source, cursor);
      continue;
    }
    if (source[cursor] === "{") {
      const action = scanEmbeddedCode(source, cursor);
      if (!action.terminated) {
        const recovery = /(?:^|\n)[\t ]*(%%)(?=[\t ]*(?:\r?\n|$))/gmu;
        recovery.lastIndex = cursor + 1;
        const match = recovery.exec(source);
        if (match?.index !== undefined) {
          const markerOffset = match[0].lastIndexOf("%%");
          cursor = match.index + markerOffset;
          continue;
        }
      }
      cursor = action.end;
      continue;
    }
    cursor += 1;
  }

  return delimiters;
};

export const readIdentifier = (
  source: string,
  start: number,
  limit = source.length,
): { readonly end: number; readonly value: string } | undefined => {
  if (!isIdentifierStart(source[start])) {
    return undefined;
  }
  let end = start + 1;
  while (end < limit && isIdentifierPart(source[end])) {
    end += 1;
  }
  return { end, value: source.slice(start, end) };
};

export const lineStartAt = (source: string, offset: number): number =>
  source.lastIndexOf("\n", Math.max(0, offset - 1)) + 1;

export const lineEndAt = (source: string, offset: number): number => {
  const newline = source.indexOf("\n", offset);
  return newline < 0 ? source.length : newline + 1;
};
