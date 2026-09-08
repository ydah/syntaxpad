# Architecture

SyntaxPad is a VS Code extension composed of a UI-independent grammar core, a language server,
visualization and external-tool libraries, and an extension host. Grammar text is authoritative; all
models and views are derived and disposable.

## Vocabulary

- **Dialect:** `yacc`, `bison`, or `lrama`. It selects known directives, standard rules, completion,
  and diagnostics; unrecognized source is still retained.
- **CST:** lossless ranged nodes over the decoded source string.
- **Semantic model:** definitions, references, dependencies, diagnostics, and reachability derived
  from the CST.
- **Action:** embedded target-language code delimited by `{...}`.
- **Midrule action:** an action before the end of an alternative; it occupies a semantic-value
  position.
- **Parameterized rule:** an Lrama `%rule name(P)` definition or `name(arg)` use.
- **Opaque node:** bounded source that the parser does not classify. It is retained and prevents
  transformations that cannot establish a safe boundary.
- **Text patch:** a replacement over a half-open UTF-16 range. A patch set must be non-overlapping.

## Package boundaries

| Package            | Responsibility                                                              | Boundary                                            |
| ------------------ | --------------------------------------------------------------------------- | --------------------------------------------------- |
| `@syntaxpad/core`  | parsing, CST/model derivation, diagnostics, and patch planning              | no Node.js, VS Code, DOM, or renderer dependency    |
| `@syntaxpad/lsp`   | document snapshots and LSP range/protocol translation                       | consumes only the core public API                   |
| `@syntaxpad/viz`   | railroad/dependency view models and SVG rendering                           | consumes only core models; no editor state          |
| `@syntaxpad/tools` | Bison/Lrama invocation and report normalization                             | Node.js process/filesystem boundary; no VS Code API |
| `syntaxpad-vscode` | extension lifecycle, commands, Webview, trust, navigation, and tool consent | owns VS Code APIs and composes the other packages   |

The extension bundles the language server and Webview. Core parsing is also used directly by the
extension host to build visualization models and plan commands.

## Data flow

```text
decoded .y text -> core parser -> CST -> semantic model
                                  |             |
                                  |             +-> LSP diagnostics/navigation
                                  |             +-> railroad/dependency view models
                                  +-> patch planner -> reparse/postcondition -> WorkspaceEdit

trusted command -> confirmation -> tool runner -> normalized conflict report -> diagnostics/view
```

Documents are cached by URI, dialect, and version in the language server. The extension host keeps a
separate versioned visualization cache. A document change invalidates the relevant derived state;
the source string remains the only persistent grammar representation.

## Errors and partial results

Core diagnostics have a stable code, severity, and UTF-16 range. Unknown declarations and rule items
remain represented rather than being discarded. Transform functions return a typed success or
failure and never expose a partial patch set; successful plans are reparsed and checked against a
structural postcondition before the extension creates one `WorkspaceEdit`.

The language server drops diagnostics calculated for an obsolete document version. External-tool
failures are normalized as conflict-report states so grammar parsing and visualization can continue.
The process and report lifecycle is specified in [external-tool integration](external-tools.md), and
its trust boundary is specified in the [security model](security.md).

## Dependencies and licenses

Exact versions are pinned in [`package-lock.json`](../../package-lock.json). Runtime package
manifests are authoritative for dependency membership.

| Dependency                            | Purpose                                  | License    |
| ------------------------------------- | ---------------------------------------- | ---------- |
| TypeScript                            | compiler                                 | Apache-2.0 |
| VS Code language client/server        | LSP transport                            | MIT        |
| `@dagrejs/dagre`                      | dependency-graph layout                  | MIT        |
| `fast-xml-parser`                     | Bison XML boundary                       | MIT        |
| Zod                                   | Webview/configuration message validation | MIT        |
| esbuild                               | extension and Webview bundles            | MIT        |
| Vitest / fast-check                   | tests and generated cases                | MIT        |
| ESLint / typescript-eslint / Prettier | quality gates                            | MIT        |

No third-party grammar corpus is committed. The fetch script pins upstream commits; fetched files
retain their upstream license and are stored in ignored `fixtures/external/`.
