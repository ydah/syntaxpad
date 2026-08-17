# SyntaxPad

SyntaxPad is a VS Code extension and language service for inspecting and editing Bison, Yacc, and
Lrama grammar files. The `.y` file remains the only source of truth; diagrams and semantic data are
derived views.

## Features

- Source-preserving, error-tolerant parsing of decoded editor text, including comments, whitespace,
  BOM, LF/CRLF, unknown directives, and embedded code.
- Railroad diagrams with conservative left/right-recursion folding and Lrama standard-rule
  compaction.
- Bounded dependency views with neighborhood, reachable, whole-graph, and token-usage search.
- Diagnostics, completion, hover, definitions, references, symbols, action folding, and rename over
  classified references.
- Extract, inline, wrap, add, and reorder patch planning with one-step editor Undo.
- Bison XML and Lrama conflict analysis with diagnostics, diagram status, counterexamples, and
  location navigation.

Encoding, rename, and structural-transform limitations are documented in the
[grammar-core specification](docs/spec/core.md#current-limitations). Automated checks do not yet
constitute release acceptance; see the [current quality record](docs/quality/records.md).

SyntaxPad requires VS Code 1.125 or newer. Open a `.y` or `.yy` file and run **SyntaxPad: Open
Grammar View**.

## Install a local build

```sh
npm install
npm run package
code --install-extension syntaxpad.vsix
```

The generated `syntaxpad.vsix` is self-contained. External parser generators remain optional.

## Commands and settings

The [extension manifest](packages/syntaxpad-vscode/package.json) is the canonical list of commands,
configuration keys, defaults, menus, and Workspace Trust restrictions. Use the command palette and
VS Code Settings UI to discover the installed version's available surface.

The **SyntaxPad Metrics** output channel records cursor-to-diagram, diagram-to-editor, and
refactoring application latency locally. The language-server output records diagnostics latency.

## External-tool safety

Conflict analysis is disabled in untrusted workspaces. A new executable/argument configuration shows
its possible invocations for confirmation, and the process runs without a shell in a temporary
directory with bounded captured output. These controls are not a process sandbox, timeout is a soft
termination request, and confirmation is shared across workspaces for the same configuration. See
the canonical [security model](docs/spec/security.md) and
[external-tool limitations](docs/spec/external-tools.md#current-limitations).

## Development

Requirements: Node.js 20 or newer and npm 10 or newer.

```sh
npm install
npm run check
npm run benchmark
```

The committed `fixtures/small/ambiguous.y` grammar is a quick conflict-analysis smoke test. Bison
uses XML when available and falls back to its verbose text report; Lrama uses its states report.

The [documentation index](docs/README.md) is the single entry point for architecture, decisions,
quality contracts, [verification procedures](docs/quality/verification.md), safety invariants, and
the [remaining human UX gates](docs/quality/scenarios.md).
