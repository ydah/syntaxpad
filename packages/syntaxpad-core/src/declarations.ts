import { getDialectProfile } from "./dialect.js";
import { scanEmbeddedCode } from "./embedded-code.js";
import { isIdentifierPart, readIdentifier, scanComment, scanQuotedLiteral } from "./grammar-lex.js";
import type {
  DeclarationNode,
  DeclaredSymbol,
  Dialect,
  SourceRange,
  UnknownNode,
} from "./types.js";

interface DeclarationParse {
  readonly declarations: readonly DeclarationNode[];
  readonly unknown: readonly UnknownNode[];
}

interface DirectiveStart {
  readonly name: string;
  readonly range: SourceRange;
}

const SYMBOL_DIRECTIVES = new Set([
  "%destructor",
  "%error-token",
  "%inline",
  "%left",
  "%nonassoc",
  "%nterm",
  "%precedence",
  "%printer",
  "%right",
  "%start",
  "%token",
  "%type",
]);

const findDirectiveStarts = (
  source: string,
  start: number,
  end: number,
): readonly DirectiveStart[] => {
  const directives: DirectiveStart[] = [];
  let cursor = start;

  while (cursor < end) {
    const commentEnd = scanComment(source, cursor, end);
    if (commentEnd !== undefined) {
      cursor = commentEnd;
      continue;
    }
    if (source.startsWith("%{", cursor)) {
      const close = source.indexOf("%}", cursor + 2);
      cursor = close < 0 || close >= end ? end : close + 2;
      continue;
    }
    if (source[cursor] === "{") {
      cursor = Math.min(scanEmbeddedCode(source, cursor).end, end);
      continue;
    }
    if (source[cursor] === "'" || source[cursor] === '"') {
      cursor = scanQuotedLiteral(source, cursor, end);
      continue;
    }
    if (source[cursor] !== "%" || !/[A-Za-z]/u.test(source[cursor + 1] ?? "")) {
      cursor += 1;
      continue;
    }

    let directiveEnd = cursor + 2;
    while (directiveEnd < end && /[A-Za-z0-9-]/u.test(source[directiveEnd] ?? "")) {
      directiveEnd += 1;
    }
    directives.push({
      name: source.slice(cursor, directiveEnd),
      range: { end: directiveEnd, start: cursor },
    });
    cursor = directiveEnd;
  }

  return directives;
};

const scanTypeTag = (
  source: string,
  start: number,
  end: number,
): { readonly end: number; readonly tag: string } | undefined => {
  if (source[start] !== "<") {
    return undefined;
  }
  const close = source.indexOf(">", start + 1);
  if (close < 0 || close >= end) {
    return undefined;
  }
  return { end: close + 1, tag: source.slice(start + 1, close) };
};

const extractSymbols = (
  source: string,
  directive: DirectiveStart,
  end: number,
): readonly DeclaredSymbol[] => {
  if (!SYMBOL_DIRECTIVES.has(directive.name)) {
    return [];
  }

  const symbols: DeclaredSymbol[] = [];
  let cursor = directive.range.end;
  let currentTag: string | undefined;

  while (cursor < end) {
    const commentEnd = scanComment(source, cursor, end);
    if (commentEnd !== undefined) {
      cursor = commentEnd;
      continue;
    }
    if (source[cursor] === "{") {
      cursor = Math.min(scanEmbeddedCode(source, cursor).end, end);
      continue;
    }
    const typeTag = scanTypeTag(source, cursor, end);
    if (typeTag !== undefined) {
      currentTag = typeTag.tag;
      cursor = typeTag.end;
      continue;
    }
    if (source[cursor] === "'" || source[cursor] === '"') {
      const literalEnd = scanQuotedLiteral(source, cursor, end);
      if (directive.name !== "%type" && directive.name !== "%nterm") {
        const symbol = {
          name: source.slice(cursor, literalEnd),
          range: { end: literalEnd, start: cursor },
        };
        symbols.push(currentTag === undefined ? symbol : { ...symbol, typeTag: currentTag });
      }
      cursor = literalEnd;
      continue;
    }

    const identifier = readIdentifier(source, cursor, end);
    if (identifier === undefined) {
      cursor += 1;
      continue;
    }

    const previous = source[cursor - 1];
    const isPartOfNumber = /[0-9]/u.test(previous ?? "") || /[0-9]/u.test(source[cursor] ?? "");
    const isAliasWord =
      previous === '"' ||
      previous === "'" ||
      (previous !== undefined && isIdentifierPart(previous));
    if (!isPartOfNumber && !isAliasWord) {
      const symbol = {
        name: identifier.value,
        range: { end: identifier.end, start: cursor },
      };
      symbols.push(currentTag === undefined ? symbol : { ...symbol, typeTag: currentTag });
      if (directive.name === "%start") {
        break;
      }
    }
    cursor = identifier.end;
  }

  return symbols;
};

export const parseDeclarations = (
  source: string,
  range: SourceRange,
  dialect: Dialect,
): DeclarationParse => {
  const profile = getDialectProfile(dialect);
  const starts = findDirectiveStarts(source, range.start, range.end);
  const declarations: DeclarationNode[] = [];
  const unknown: UnknownNode[] = [];

  starts.forEach((directive, index) => {
    const next = starts[index + 1];
    const end = next?.range.start ?? range.end;
    const known = profile.directives.has(directive.name);
    const declaration: DeclarationNode = {
      directive: directive.name,
      directiveRange: directive.range,
      known,
      range: { end, start: directive.range.start },
      symbols: extractSymbols(source, directive, end),
    };
    declarations.push(declaration);
    if (!known) {
      unknown.push({ context: "declaration", range: declaration.range });
    }
  });

  return { declarations, unknown };
};
