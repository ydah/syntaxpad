import { parseDeclarations } from "./declarations.js";
import { findSectionDelimiters } from "./grammar-lex.js";
import { parseRules } from "./rules.js";
import type {
  FoldingRange,
  GrammarDiagnostic,
  GrammarDocument,
  ParseOptions,
  RuleNode,
  SectionNode,
  SourceRange,
} from "./types.js";

const determineNewline = (source: string): "\n" | "\r\n" =>
  source.includes("\r\n") ? "\r\n" : "\n";

const createSections = (
  sourceLength: number,
  delimiters: readonly SourceRange[],
): readonly SectionNode[] => {
  const first = delimiters[0];
  if (first === undefined) {
    return [{ contentRange: { end: sourceLength, start: 0 }, kind: "declarations" }];
  }

  const declarations: SectionNode = {
    contentRange: { end: first.start, start: 0 },
    delimiterRange: first,
    kind: "declarations",
  };
  const second = delimiters[1];
  if (second === undefined) {
    return [declarations, { contentRange: { end: sourceLength, start: first.end }, kind: "rules" }];
  }

  return [
    declarations,
    {
      contentRange: { end: second.start, start: first.end },
      delimiterRange: second,
      kind: "rules",
    },
    { contentRange: { end: sourceLength, start: second.end }, kind: "epilogue" },
  ];
};

const missingSectionDiagnostic = (
  sourceLength: number,
  delimiters: readonly SourceRange[],
): GrammarDiagnostic | undefined => {
  if (delimiters.length > 0) {
    return undefined;
  }
  return {
    code: "missing-rules-section",
    message: "Grammar has no first %% rules-section delimiter.",
    range: { end: sourceLength, start: sourceLength },
    severity: "error",
  };
};

export const parseGrammar = (source: string, options: ParseOptions = {}): GrammarDocument => {
  const dialect = options.dialect ?? "bison";
  const delimiters = findSectionDelimiters(source);
  const sections = createSections(source.length, delimiters);
  const declarationsSection = sections.find((section) => section.kind === "declarations");
  const rulesSection = sections.find((section) => section.kind === "rules");
  const declarations = parseDeclarations(
    source,
    declarationsSection?.contentRange ?? { end: 0, start: 0 },
    dialect,
  );
  const rules =
    rulesSection === undefined
      ? { diagnostics: [], rules: [], unknown: [] }
      : parseRules(source, rulesSection.contentRange);
  const missingSection = missingSectionDiagnostic(source.length, delimiters);

  return {
    declarations: declarations.declarations,
    dialect,
    diagnostics:
      missingSection === undefined ? rules.diagnostics : [missingSection, ...rules.diagnostics],
    encoding: source.startsWith("\uFEFF") ? "utf8-bom" : "utf8",
    newline: determineNewline(source),
    rules: rules.rules,
    sections,
    source,
    unknown: [...declarations.unknown, ...rules.unknown],
  };
};

export const printGrammar = (document: GrammarDocument): string => document.source;

export const findRuleAtOffset = (document: GrammarDocument, offset: number): RuleNode | undefined =>
  document.rules.find((rule) => offset >= rule.range.start && offset <= rule.range.end);

export const getFoldingRanges = (document: GrammarDocument): readonly FoldingRange[] => {
  const ranges: FoldingRange[] = [];
  for (const rule of document.rules) {
    for (const alternative of rule.alternatives) {
      for (const item of alternative.items) {
        if (item.kind === "action" && item.range.end > item.range.start + 2) {
          ranges.push({ end: item.range.end, kind: "action", start: item.range.start });
        }
      }
    }
  }

  const declarationSource = document.sections.find(
    (section) => section.kind === "declarations",
  )?.contentRange;
  if (declarationSource !== undefined) {
    let cursor = declarationSource.start;
    while (cursor < declarationSource.end) {
      const start = document.source.indexOf("%{", cursor);
      if (start < 0 || start >= declarationSource.end) {
        break;
      }
      const end = document.source.indexOf("%}", start + 2);
      if (end < 0 || end >= declarationSource.end) {
        break;
      }
      ranges.push({ end: end + 2, kind: "prologue", start });
      cursor = end + 2;
    }
  }
  return ranges;
};
