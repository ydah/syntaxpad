# Prior art

Reviewed 2026-07-26. Primary sources are linked so decisions can be revisited as upstream tools
evolve.

## Grammar editors and language support

- [Lex/Flex/Yacc/Bison for VS Code](https://github.com/faustinoaq/vscode-lex-flex-yacc-bison)
  provides TextMate syntax highlighting. It deliberately does not provide a lossless CST, structural
  refactoring, grammar visualization, or conflict mapping.
- [Yash](https://marketplace.visualstudio.com/items?itemName=daohong-emilio.yash) adds completion,
  diagnostics, navigation, rename, and embedded-language highlighting. Its public feature set does
  not cover Lrama parameterized rules, action-reference-safe structural transforms, railroad views,
  or Bison XML conflict ingestion. SyntaxPad should coexist with syntax highlighters and avoid
  owning basic editor behavior.
- [Lrama](https://github.com/ruby/lrama) itself supports parameterized rules, `%inline`, and syntax
  diagram generation. Its renderer is generator-oriented rather than a live, source-ranged editor
  view. Its [standard library](https://github.com/ruby/lrama/blob/master/lib/lrama/grammar/stdlib.y)
  is the canonical list for `option`, `list`, `nonempty_list`, `separated_list`,
  `separated_nonempty_list`, `preceded`, `terminated`, and `delimited`.

Conclusion: reuse VS Code's editor/LSP surfaces and Lrama's terminology/pattern definitions, not an
existing editor implementation.

## Railroad diagrams

- [Railroad Diagrams](https://github.com/tabatkins/railroad-diagrams) is a compact CC0 SVG renderer
  for EBNF-like sequences and choices. Its layout concepts are useful, but the public model has no
  source ranges, action markers, `%prec` annotations, or raw/folded recursive views.
- [Railroad Diagram Generator](https://github.com/GuntherRademacher/rr) accepts several grammar
  syntaxes, including Bison in integrations such as XML Calabash. Converting to EBNF would discard
  action positions and source identity, so it is suitable for export, not the live canonical view.
- Lrama already advertises syntax diagrams. Calling its CLI would make ordinary navigation depend on
  Ruby and cannot update within the 50 ms cursor budget.

Decision: implement the small source-ranged SVG scene graph needed by SyntaxPad. Preserve a clean
renderer boundary so a future export adapter can target `rr`.

## Parser/CST approaches

- [Tree-sitter](https://tree-sitter.github.io/tree-sitter/) is incremental, error tolerant, and fast
  enough for per-keystroke parsing. It represents errors and inserted tokens explicitly.
- A Tree-sitter grammar plus external scanner would still require a second embedded-C scanner,
  byte-preserving trivia ownership rules, a native/Wasm artifact build, and Lrama grammar
  maintenance. SyntaxPad's initial grammar needs recovery more than syntactic rejection.
- A dedicated single-pass scanner can make every byte belong to exactly one ranged node, retain
  unknown directives, and share C lexical states with action-reference extraction.

Decision: begin with the measured dedicated TypeScript parser. The stable `parseGrammar` boundary
allows replacement by Tree-sitter or Rust/Wasm if M0 measurements exceed the budget.

## Generator reports

- GNU Bison documents `--xml[=FILE]`, `--report=state,lookahead,solved,counterexamples`, and
  Graphviz output in its
  [output options](https://www.gnu.org/software/bison/manual/html_node/Output-Files.html). Its
  [XML guide](https://www.gnu.org/software/bison/manual/html_node/Xml.html) states that the XML can
  reproduce text and DOT reports.
- The Bison manual warns that a full automaton graph becomes impractical on real grammars. This
  reinforces SyntaxPad's rule-dependency neighborhood as the default, not an LR-state graph.
- Lrama 0.8 documents text report pages and exposes `--report=states`/trace-related CLI behavior,
  but does not publish a stable structured report schema comparable to Bison XML.

Decision: Bison XML is the primary adapter, Bison text and Lrama text are tolerant fallbacks, and a
failed detailed parse degrades to total conflict counts plus captured stderr.

## Reuse summary

| Capability                 | Reuse                   | Why                                                      |
| -------------------------- | ----------------------- | -------------------------------------------------------- |
| Editing, undo, search, Git | VS Code                 | Mature and already optimized                             |
| Language protocol          | `vscode-languageserver` | Standard editor-independent transport                    |
| Graph layout               | `@dagrejs/dagre`        | Deterministic layered layout; MIT                        |
| Bison XML parsing          | `fast-xml-parser`       | Defensive XML-to-object boundary; MIT                    |
| Runtime message validation | `zod`                   | Compact discriminated schema validation; MIT             |
| Railroad layout            | SyntaxPad scene graph   | Source mapping and recursive folding are domain-specific |
| Grammar CST                | SyntaxPad parser        | Byte ownership and tolerant unknown-node pass-through    |
