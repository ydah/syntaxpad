import {
  analyzeGrammar,
  findRuleAtOffset,
  getDialectProfile,
  getDirectiveCompletions,
  getFoldingRanges,
  parseGrammar,
  renameSymbol,
  type Dialect,
  type FoldingRange,
  type GrammarDocument,
  type GrammarModel,
  type SourceRange,
  type TransformResult,
} from "@syntaxpad/core";

export interface LanguageSnapshot {
  readonly document: GrammarDocument;
  readonly model: GrammarModel;
}

export interface ServiceCompletion {
  readonly detail: string;
  readonly kind: "directive" | "nonterminal" | "token";
  readonly label: string;
}

export interface ServiceHover {
  readonly markdown: string;
  readonly range: SourceRange;
}

export interface ServiceSymbol {
  readonly detail: string;
  readonly name: string;
  readonly range: SourceRange;
  readonly selectionRange: SourceRange;
}

const contains = (range: SourceRange, offset: number): boolean =>
  offset >= range.start && offset <= range.end;

const uniqueByLabel = (items: readonly ServiceCompletion[]): readonly ServiceCompletion[] => {
  const labels = new Set<string>();
  return items.filter((item) => {
    if (labels.has(item.label)) {
      return false;
    }
    labels.add(item.label);
    return true;
  });
};

const sourceExcerpt = (source: string, range: SourceRange): string =>
  source.slice(range.start, range.end).trim().slice(0, 400);

export const createSnapshot = (source: string, dialect: Dialect): LanguageSnapshot => {
  const document = parseGrammar(source, { dialect });
  return { document, model: analyzeGrammar(document) };
};

export const symbolAtOffset = (
  snapshot: LanguageSnapshot,
  offset: number,
): { readonly name: string; readonly range: SourceRange } | undefined => {
  for (const [name, definitions] of snapshot.model.definitions) {
    const definition = definitions.find((candidate) => contains(candidate.range, offset));
    if (definition !== undefined) {
      return { name, range: definition.range };
    }
  }
  const reference = snapshot.model.references.find((candidate) =>
    contains(candidate.range, offset),
  );
  if (reference !== undefined) {
    return { name: reference.name, range: reference.range };
  }
  for (const declaration of snapshot.document.declarations) {
    const symbol = declaration.symbols.find((candidate) => contains(candidate.range, offset));
    if (symbol !== undefined) {
      return { name: symbol.name, range: symbol.range };
    }
  }
  for (const rule of snapshot.document.rules) {
    for (const alternative of rule.alternatives) {
      for (const item of alternative.items) {
        if (item.kind !== "action") {
          continue;
        }
        const reference = item.references.find((candidate) => contains(candidate.range, offset));
        if (reference?.target.kind === "name") {
          return { name: reference.target.name, range: reference.range };
        }
      }
    }
  }
  return undefined;
};

export const getCompletions = (
  snapshot: LanguageSnapshot,
  offset: number,
): readonly ServiceCompletion[] => {
  const declarationsSection = snapshot.document.sections.find(
    (section) => section.kind === "declarations",
  );
  const inDeclarations =
    declarationsSection !== undefined && contains(declarationsSection.contentRange, offset);
  const directives = inDeclarations
    ? getDirectiveCompletions(snapshot.document.dialect)
    : [...getDialectProfile(snapshot.document.dialect).directives]
        .filter((directive) => directive === "%empty" || directive === "%prec")
        .map((label) => ({
          detail: `${snapshot.document.dialect} rule directive`,
          kind: "directive" as const,
          label,
        }));
  const nonterminals = snapshot.document.rules.map((rule) => ({
    detail: `${String(snapshot.model.references.filter((reference) => reference.name === rule.name).length)} reference(s)`,
    kind: "nonterminal" as const,
    label: rule.name,
  }));
  const tokens = [...snapshot.model.terminals]
    .filter((name) => !name.startsWith("'") && !name.startsWith('"'))
    .map((label) => ({
      detail: "declared token",
      kind: "token" as const,
      label,
    }));
  return [...uniqueByLabel([...directives, ...nonterminals, ...tokens])].sort((left, right) =>
    left.label.localeCompare(right.label),
  );
};

export const getHover = (snapshot: LanguageSnapshot, offset: number): ServiceHover | undefined => {
  const symbol = symbolAtOffset(snapshot, offset);
  if (symbol === undefined) {
    return undefined;
  }
  const definitions = snapshot.model.definitions.get(symbol.name) ?? [];
  const references = snapshot.model.references.filter(
    (reference) => reference.name === symbol.name,
  );
  const declared = snapshot.document.declarations.flatMap((declaration) =>
    declaration.symbols
      .filter((candidate) => candidate.name === symbol.name)
      .map((candidate) => ({
        directive: declaration.directive,
        typeTag: candidate.typeTag,
      })),
  );
  const definitionPreview = definitions[0]
    ? `\n\n\`\`\`yacc\n${sourceExcerpt(
        snapshot.document.source,
        snapshot.document.rules.find((rule) => rule.id === definitions[0]?.ruleId)?.range ??
          definitions[0].range,
      )}\n\`\`\``
    : "";
  const declarationDetail =
    declared.length === 0
      ? ""
      : `\n\nDeclared by ${declared
          .map(
            (entry) =>
              `\`${entry.directive}\`${entry.typeTag === undefined ? "" : ` as \`<${entry.typeTag}>\``}`,
          )
          .join(", ")}.`;
  return {
    markdown: `**${symbol.name}** — ${definitions.length > 0 ? "nonterminal" : "token or unresolved symbol"}\n\n${String(references.length)} reference(s), ${String(definitions.length)} definition(s).${declarationDetail}${definitionPreview}`,
    range: symbol.range,
  };
};

export const getDefinitionRanges = (
  snapshot: LanguageSnapshot,
  offset: number,
): readonly SourceRange[] => {
  const symbol = symbolAtOffset(snapshot, offset);
  return symbol === undefined
    ? []
    : (snapshot.model.definitions.get(symbol.name) ?? []).map((definition) => definition.range);
};

export const getReferenceRanges = (
  snapshot: LanguageSnapshot,
  offset: number,
  includeDeclaration: boolean,
): readonly SourceRange[] => {
  const symbol = symbolAtOffset(snapshot, offset);
  if (symbol === undefined) {
    return [];
  }
  const references = snapshot.model.references
    .filter((reference) => reference.name === symbol.name)
    .map((reference) => reference.range);
  const actionReferences = snapshot.document.rules.flatMap((rule) =>
    rule.alternatives.flatMap((alternative) =>
      alternative.items.flatMap((item) =>
        item.kind === "action"
          ? item.references
              .filter(
                (reference) =>
                  reference.target.kind === "name" && reference.target.name === symbol.name,
              )
              .map((reference) => reference.range)
          : [],
      ),
    ),
  );
  const declarations = includeDeclaration
    ? (snapshot.model.definitions.get(symbol.name) ?? []).map((definition) => definition.range)
    : [];
  return [...declarations, ...references, ...actionReferences];
};

export const renameAtOffset = (
  snapshot: LanguageSnapshot,
  offset: number,
  newName: string,
): TransformResult => {
  const symbol = symbolAtOffset(snapshot, offset);
  return symbol === undefined
    ? {
        error: { code: "symbol-not-found", message: "No grammar symbol is selected." },
        ok: false,
      }
    : renameSymbol(snapshot.document, symbol.name, newName);
};

export const getDocumentSymbols = (snapshot: LanguageSnapshot): readonly ServiceSymbol[] =>
  snapshot.document.rules.map((rule) => ({
    detail: `${String(rule.alternatives.length)} alternative(s)`,
    name: rule.name,
    range: rule.range,
    selectionRange: rule.nameRange,
  }));

export const getServiceFoldingRanges = (snapshot: LanguageSnapshot): readonly FoldingRange[] =>
  getFoldingRanges(snapshot.document);

export const ruleNameAtOffset = (snapshot: LanguageSnapshot, offset: number): string | undefined =>
  findRuleAtOffset(snapshot.document, offset)?.name;
