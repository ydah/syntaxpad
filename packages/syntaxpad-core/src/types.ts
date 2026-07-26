export const DIALECTS = ["yacc", "bison", "lrama"] as const;

export type Dialect = (typeof DIALECTS)[number];

export interface SourceRange {
  readonly start: number;
  readonly end: number;
}

export type DiagnosticSeverity = "error" | "warning" | "information";

export interface GrammarDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly range: SourceRange;
  readonly severity: DiagnosticSeverity;
}

export interface NamedReference {
  readonly name: string;
  readonly range: SourceRange;
}

export type ActionReferenceTarget =
  | { readonly kind: "result" }
  | { readonly index: number; readonly kind: "index" }
  | { readonly kind: "name"; readonly name: string };

export interface ActionReference {
  readonly kind: "location" | "value";
  readonly range: SourceRange;
  readonly target: ActionReferenceTarget;
  readonly typeTag?: string;
}

export interface SymbolItem {
  readonly kind: "symbol";
  readonly name: string;
  readonly nameRange: SourceRange;
  readonly namedReference?: NamedReference;
  readonly range: SourceRange;
}

export interface LiteralItem {
  readonly kind: "literal";
  readonly range: SourceRange;
  readonly text: string;
}

export interface ParameterArgument {
  readonly name: string;
  readonly range: SourceRange;
}

export interface ParameterizedItem {
  readonly arguments: readonly ParameterArgument[];
  readonly kind: "parameterized";
  readonly name: string;
  readonly nameRange: SourceRange;
  readonly namedReference?: NamedReference;
  readonly range: SourceRange;
}

export interface ActionItem {
  readonly codeRange: SourceRange;
  readonly isMidrule: boolean;
  readonly kind: "action";
  readonly range: SourceRange;
  readonly references: readonly ActionReference[];
  readonly safe: boolean;
  readonly semanticPosition: number;
  readonly terminated: boolean;
}

export interface PrecedenceItem {
  readonly kind: "precedence";
  readonly range: SourceRange;
  readonly symbol?: string;
  readonly symbolRange?: SourceRange;
}

export interface EmptyItem {
  readonly kind: "empty";
  readonly range: SourceRange;
}

export interface UnknownItem {
  readonly kind: "unknown";
  readonly range: SourceRange;
  readonly text: string;
}

export type AlternativeItem =
  | ActionItem
  | EmptyItem
  | LiteralItem
  | ParameterizedItem
  | PrecedenceItem
  | SymbolItem
  | UnknownItem;

export interface AlternativeNode {
  readonly index: number;
  readonly items: readonly AlternativeItem[];
  readonly range: SourceRange;
  readonly separatorRange?: SourceRange;
}

export interface RuleNode {
  readonly alternatives: readonly AlternativeNode[];
  readonly colonRange: SourceRange;
  readonly headRange: SourceRange;
  readonly id: string;
  readonly inline: boolean;
  readonly name: string;
  readonly nameRange: SourceRange;
  readonly parameterNames: readonly ParameterArgument[];
  readonly parameterized: boolean;
  readonly range: SourceRange;
  readonly semicolonRange?: SourceRange;
}

export interface DeclaredSymbol {
  readonly name: string;
  readonly range: SourceRange;
  readonly typeTag?: string;
}

export interface DeclarationNode {
  readonly directive: string;
  readonly directiveRange: SourceRange;
  readonly known: boolean;
  readonly range: SourceRange;
  readonly symbols: readonly DeclaredSymbol[];
}

export interface SectionNode {
  readonly contentRange: SourceRange;
  readonly delimiterRange?: SourceRange;
  readonly kind: "declarations" | "rules" | "epilogue";
}

export interface UnknownNode {
  readonly context: "declaration" | "rule";
  readonly range: SourceRange;
}

export interface GrammarDocument {
  readonly declarations: readonly DeclarationNode[];
  readonly dialect: Dialect;
  readonly diagnostics: readonly GrammarDiagnostic[];
  readonly encoding: "utf8" | "utf8-bom";
  readonly newline: "\n" | "\r\n";
  readonly rules: readonly RuleNode[];
  readonly sections: readonly SectionNode[];
  readonly source: string;
  readonly unknown: readonly UnknownNode[];
}

export interface SymbolDefinition {
  readonly name: string;
  readonly range: SourceRange;
  readonly ruleId: string;
}

export interface SymbolReference {
  readonly fromRuleId: string;
  readonly kind: "nonterminal" | "terminal" | "undefined";
  readonly name: string;
  readonly range: SourceRange;
}

export interface DependencyEdge {
  readonly from: string;
  readonly ranges: readonly SourceRange[];
  readonly to: string;
}

export interface GrammarModel {
  readonly actionReferences: readonly ActionReference[];
  readonly definitions: ReadonlyMap<string, readonly SymbolDefinition[]>;
  readonly diagnostics: readonly GrammarDiagnostic[];
  readonly edges: readonly DependencyEdge[];
  readonly references: readonly SymbolReference[];
  readonly startSymbol?: string;
  readonly terminals: ReadonlySet<string>;
  readonly unreachableRules: ReadonlySet<string>;
  readonly unusedRules: ReadonlySet<string>;
}

export interface TextPatch {
  readonly range: SourceRange;
  readonly sequence?: number;
  readonly text: string;
}

export interface TransformError {
  readonly code: string;
  readonly message: string;
  readonly range?: SourceRange;
}

export interface TransformPlan {
  readonly conflictCheckRecommended: boolean;
  readonly patches: readonly TextPatch[];
  readonly preview: string;
  readonly warnings: readonly string[];
}

export type TransformResult =
  | { readonly error: TransformError; readonly ok: false }
  | { readonly ok: true; readonly plan: TransformPlan };

export interface ParseOptions {
  readonly dialect?: Dialect;
}

export interface CompletionCandidate {
  readonly detail: string;
  readonly kind: "directive" | "nonterminal" | "token";
  readonly label: string;
}

export interface FoldingRange {
  readonly end: number;
  readonly kind: "action" | "prologue";
  readonly start: number;
}
