# SyntaxPad design

## 1. Overview and vocabulary

SyntaxPad is a VS Code extension composed of a UI-independent grammar core, an LSP server, a
visualization package, and an extension host. Text is authoritative. A **CST** is a lossless set of
ranged source nodes; a **semantic model** is disposable indexed data derived from that CST.

- **Dialect**: `yacc`, `bison`, or `lrama`; it controls known directives and diagnostics, never
  whether unknown source is retained.
- **Action**: embedded target-language code in `{...}`.
- **Midrule action**: an action between RHS symbols; it occupies a semantic-value position.
- **Parameterized rule**: Lrama `%rule name(P)` definition or `name(arg)` instantiation.
- **Opaque node**: bounded source that SyntaxPad cannot safely classify. It remains byte-identical
  and blocks unsafe transforms intersecting it.
- **Text patch**: `{ range: [start,end), text }`; a set must be sorted and non-overlapping.

## 2. Supported grammar surface

The file is declarations, first `%%`, rules, optional second `%%`, and epilogue. Section delimiters
inside `%{...%}`, comments, strings, characters, and actions are ignored.

Known Yacc/Bison declarations include `%token`, `%nterm`, `%type`, `%start`, `%left`, `%right`,
`%nonassoc`, `%precedence`, `%union`, `%code`, `%define`, `%param`, `%parse-param`, `%lex-param`,
`%destructor`, `%printer`, `%expect`, `%expect-rr`, `%locations`, `%empty`, and `%prec`. Unknown
directives are opaque declarations rather than errors.

Lrama additions are based on its
[parser grammar](https://github.com/ruby/lrama/blob/master/parser.y) and
[standard library](https://github.com/ruby/lrama/blob/master/lib/lrama/grammar/stdlib.y):

- `%rule name(P, Q)` and `%rule %inline name(P)`
- `%inline` declarations
- nested instantiations such as `option(separated_nonempty_list(',', item))`
- standard `option`, `ioption`, `list`, `nonempty_list`, `separated_list`,
  `separated_nonempty_list`, `preceded`, `terminated`, and `delimited`
- `%after-shift`, `%before-reduce`, `%after-reduce`, `%after-shift-error-token`, `%after-pop-stack`,
  `%error-token`, and `%no-stdlib`

Action references recognized with byte ranges are `$$`, `$n`, `$name`, `$[name]`, `@$`, `@n`,
`@name`, and `@[name]`. Typed Bison forms such as `$<tag>n` and `$<tag>$` are retained and their
target suffix is classified. Named references attached to RHS symbols (`symbol[label]`) feed name
resolution.

## 3. Architecture and data flow

```text
.y bytes -> core scanner/parser -> lossless CST -> semantic model
                                         |             |
                                         |             +-> diagnostics/LSP
                                         |             +-> visualization view models
                                         +-> patch planner -> validate -> WorkspaceEdit

trusted command request -> VS Code confirmation -> tool adapter -> normalized conflicts
```

`@syntaxpad/core` has no Node, VS Code, DOM, or renderer dependency. `@syntaxpad/viz` consumes only
core public models. `@syntaxpad/lsp` owns documents and translates ranges/protocol objects.
`syntaxpad-vscode` owns Workspace Trust, process execution, confirmation state, Webview CSP, and
editor navigation.

## 4. CST and semantic model

All offsets are UTF-16 code-unit offsets because VS Code/LSP positions use them. The original input
string is held once:

```ts
interface SourceRange {
  readonly start: number;
  readonly end: number;
}
interface GrammarDocument {
  readonly source: string;
  readonly newline: "\n" | "\r\n";
  readonly encoding: "utf8" | "utf8-bom";
  readonly sections: readonly SectionNode[];
  readonly rules: readonly RuleNode[];
  readonly unknown: readonly UnknownNode[];
  readonly diagnostics: readonly Diagnostic[];
  print(): string; // returns source exactly
}
```

Rule nodes point to a head, colon, alternatives, and semicolon ranges. Alternative items form a
discriminated union: symbol, literal, parameterized reference, action, `%prec`, `%empty`, and
unknown. Trivia remains in the source between item ranges. The model indexes definitions,
references, declarations, precedence, reachability, action references, and adjacency.

Recovery synchronizes at top-level `%%`, a rule semicolon, or a line-start head followed by `:`. An
unclosed action ends at the rules-section boundary/EOF and emits one diagnostic. Parsing never
reconstructs unchanged text.

## 5. Embedded-code lexical scanner

The scanner is a deterministic state machine over:

1. normal code with nested `{`/`}`;
2. double-quoted and single-quoted literals with escapes and line splices;
3. C/C++ line and block comments;
4. raw C++ strings with captured delimiters;
5. a preprocessing line beginning after horizontal whitespace and `#`, including `\` continuations.

Only normal-code state changes brace depth or recognizes `$`/`@` references. Comments and literals
are never searched. Each extracted reference includes its sigil, reference kind, target, optional
type tag, and absolute range. Scanner uncertainty marks the action unsafe for structural
refactoring.

## 6. Editing pipeline

1. Resolve the command against the current document version and CST ranges.
2. Build a transformation plan without mutating source.
3. Rewrite action references. Named references rename directly; positional references use an
   explicit old-position to new-position map.
4. Reject boundary-crossing references, unsafe actions, overlapping patches, invalid names, and
   ambiguous definitions with a user-facing reason.
5. Infer indentation, leading `|`, colon, and semicolon style from the target rule and nearest
   sibling rules. New rules default immediately after the source rule; `sectionEnd` is configurable.
6. Apply sorted patches from the end to the beginning.
7. Reparse and verify the requested structural postcondition. Return one LSP `WorkspaceEdit`, which
   integrates with editor undo.
8. For Extract, Inline, and Wrap, surface `conflictCheckRecommended: true`.

Patch sets use half-open ranges and cannot overlap. Insertions sharing an offset are ordered by an
explicit sequence number.

## 7. Visualization

The railroad view maps one alternative per lane. Terminals use rounded capsules, nonterminals
rectangles, actions a compact `{…}` marker, and `%prec` an annotation. Every focusable SVG group
contains a source range and keyboard activation. Lrama standard rules render as optional/repeat
groups.

Recursive folding recognizes only conservative shapes:

- optional list: empty plus `R item` or `item R`;
- non-empty list: `item` plus `R item` or `item R`;
- separated non-empty list: `item` plus `R sep item` or `item sep R`.

Actions or `%prec` inside the recursive spine disable folding. A visible “Folded recursion” badge
and toggle prevent the abstraction from being mistaken for source.

The dependency view requests a breadth-first neighborhood (default distance 1), reachable set, or
explicit whole graph. Dagre lays out the already-filtered graph. Nodes include text/icon status for
unused, undefined, conflict, and unreachable states; color is supplementary.

## 8. Tool adapters

```ts
interface ToolAdapter {
  readonly kind: "bison" | "lrama";
  buildInvocation(inputPath: string, reportPath: string): Invocation;
  parse(result: ToolResult): ConflictReport;
}
```

Bison uses
`--xml=<temp>/report.xml --report=state,lookahead,solved,counterexamples --output=/dev/null` when
the detected version supports XML. XML rules/states/conflicts are matched to grammar rule numbers
and source lines. Older Bison falls back to `--verbose` text.

Lrama uses `--report=states` and parses rule/state headings conservatively. Until Lrama publishes a
stable structured schema, unmatched output yields `detail: "counts-only"` with totals found in
stderr. All invocations use argument arrays without a shell, a temporary output directory, a 10 s
timeout, capped output, trusted workspace, and first-run confirmation showing executable and args.

## 9. LSP sequences

- **Change**: debounce 120 ms -> parse -> publish diagnostics -> notify Webview model version.
- **Completion**: identify section/context -> profile directives plus indexed symbols.
- **Hover**: locate ranged reference -> definition snippet, declaration/type, reference count.
- **Definition/references**: model range -> LSP locations.
- **Rename**: validate name -> core patch plan including named action references -> WorkspaceEdit.
- **Code actions**: advertise only when selection satisfies transform preconditions; resolve against
  the current document version.

Cursor-to-Webview messages are not debounced and do no parsing. They carry a rule ID and item range.

## 10. Performance

M0 measures complete parse/model derivation for generated 10,000-line and fetched CRuby grammars.
The first implementation is linear scanning plus set/map derivation. Documents cache by URI and
version. Visualization receives only the selected rule or filtered graph; no whole-graph layout is
done on keystrokes. If p95 parsing exceeds 300 ms on the reference machine, the parser boundary
permits Tree-sitter or Rust/Wasm without LSP/UI changes.

## 11. Errors and partial parsing

Diagnostics are stable codes with severity, range, and data. One malformed action cannot consume
past a known section boundary. Unknown directives are informational only in strict profile mode and
otherwise silent. Transform APIs return a typed `Result`; they never emit a partial patch.
External-tool failure is a report state, not an extension failure.

## 12. Security

The manifest declares limited untrusted-workspace support and restricts executable/argument
settings. Parsing and visualization remain available in Restricted Mode. External commands are not
registered or fail closed when `workspace.isTrusted` is false. Webviews use nonce CSP, scripts from
the extension only, `localResourceRoots` limited to bundled assets, validated messages, and escaped
text nodes rather than HTML interpolation.

## Appendix A: dependencies and licenses

Pinned versions are recorded in `package-lock.json`.

| Dependency                            | Purpose                            | License    |
| ------------------------------------- | ---------------------------------- | ---------- |
| TypeScript                            | compiler                           | Apache-2.0 |
| VS Code language client/server        | LSP                                | MIT        |
| `@dagrejs/dagre`                      | layered dependency layout          | MIT        |
| `fast-xml-parser`                     | Bison XML boundary                 | MIT        |
| Zod                                   | external message/config validation | MIT        |
| esbuild                               | extension/Webview bundles          | MIT        |
| Vitest / fast-check                   | tests and generated cases          | MIT        |
| ESLint / typescript-eslint / Prettier | quality gates                      | MIT        |

No third-party grammar corpus is committed. The fetch script pins upstream commits; each fetched
file retains its upstream license and is stored in ignored `fixtures/external/`.
