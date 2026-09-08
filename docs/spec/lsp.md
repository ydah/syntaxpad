# Language server

`@syntaxpad/lsp` adapts the platform-neutral grammar core to the Language Server Protocol. It owns
open text documents, converts between LSP positions and core offsets, caches parsed snapshots, and
returns protocol objects. Parsing, semantic analysis, diagnostics, and patch planning remain in
`@syntaxpad/core`.

## Documents and snapshots

The server uses incremental text synchronization. A language snapshot contains the parsed grammar
document and its derived semantic model. Snapshots are cached by document URI, document version, and
configured dialect; a cache entry is rebuilt when any of those inputs changes.

Content changes and document closes remove the URI's cached snapshot. A configuration change clears
all snapshots and schedules diagnostics for every open document. Closing a document also cancels its
pending diagnostic timer and clears published diagnostics.

Core ranges are zero-based, half-open UTF-16 code-unit offsets. LSP positions enter the core through
`TextDocument.offsetAt`, and core ranges leave through `TextDocument.positionAt`. Core text patches
are converted to LSP `TextEdit` values only at the server boundary.

## Diagnostics lifecycle

Opening a document or changing the dialect schedules diagnostics immediately. Content changes use a
debounced update; a newer change cancels the older timer. The parser and semantic analyzer produce
the diagnostics, and the server maps their severity, code, message, and range to LSP diagnostics.

Before publishing, the server compares the current open-document version with the version captured
for the analysis. Results for an older version are discarded. Published diagnostics include the
document version. Diagnostic latency is logged by the language server.

## Language features

- **Completion:** declaration positions receive dialect directives; rule positions receive the
  applicable rule directives. Indexed nonterminals and declared tokens are also offered. The server
  advertises `%`, `$`, and `@` as trigger characters.
- **Hover:** a symbol hover reports whether definitions exist, reference and definition counts,
  matching declarations and type tags, and a bounded preview of the first rule definition.
- **Definition:** a rule definition or reference resolves to every indexed definition of that symbol
  in the same document.
- **References:** indexed grammar references and named references inside actions are returned.
  Callers may also request rule definitions with the result.
- **Rename:** prepare-rename accepts indexed definitions, references, declaration symbols, and named
  action references. The core validates the requested name and produces one workspace edit for
  declarations, definitions, grammar references, labels, parameters, and named action references it
  can classify.
- **Document symbols:** every parsed grammar rule is exposed as a function-like document symbol; its
  complete rule range and name-selection range are kept distinct.
- **Folding:** embedded actions and `%{ ... %}` declaration prologues become folding ranges.
- **Code actions:** Add Alternative is returned with a computed edit when its core plan succeeds.
  Inline Rule, Extract Rule, Wrap in Option, and Wrap in List are returned as extension commands.

The server returns empty results when a requested document is not open. Rename instead reports an
invalid-parameters error because applying an edit without an open document would be ambiguous.

## Current limitations

- Definition lookup resolves grammar-rule definitions only. A token use does not navigate to its
  `%token` or related declaration.
- Inline and selection-based code actions are advertised from coarse cursor or non-empty-selection
  checks. Their complete structural preconditions are evaluated only when the command runs, so an
  advertised action can still fail without applying an edit.
- The diagnostic path has an explicit post-analysis document-version guard. Completion, hover,
  definition, references, rename, symbols, folding, and code-action requests do not repeat that
  guard after asynchronous dialect lookup, and returned workspace edits do not carry a document
  version.
