export { addAlternative, reorderAlternatives } from "./alternatives.js";
export { getDialectProfile, getDirectiveCompletions, type DialectProfile } from "./dialect.js";
export { scanEmbeddedCode } from "./embedded-code.js";
export { analyzeGrammar } from "./model.js";
export { applyTextPatches, InvalidPatchError, validatePatches } from "./patches.js";
export { findRuleAtOffset, getFoldingRanges, parseGrammar, printGrammar } from "./parser.js";
export { renameSymbol } from "./rename.js";
export { extractRule, inlineRule, wrapSelection, type WrapKind } from "./structural.js";
export { formatNewRule, formatNewRuleAlternatives, inferRuleStyle } from "./style.js";
export type {
  ActionItem,
  ActionReference,
  ActionReferenceTarget,
  AlternativeItem,
  AlternativeNode,
  CompletionCandidate,
  DeclarationNode,
  DeclaredSymbol,
  DependencyEdge,
  DiagnosticSeverity,
  Dialect,
  EmptyItem,
  FoldingRange,
  GrammarDiagnostic,
  GrammarDocument,
  GrammarModel,
  LiteralItem,
  NamedReference,
  ParameterArgument,
  ParameterizedItem,
  ParseOptions,
  PrecedenceItem,
  RuleNode,
  SectionNode,
  SourceRange,
  SymbolDefinition,
  SymbolItem,
  SymbolReference,
  TextPatch,
  TransformError,
  TransformPlan,
  TransformResult,
  UnknownItem,
  UnknownNode,
} from "./types.js";
