# SyntaxPad

SyntaxPad is a VS Code extension and language service for understanding and safely editing Bison,
Yacc, and Lrama grammar files. The `.y` file remains the only source of truth; diagrams and semantic
data are derived views.

## Features

- Lossless, error-tolerant parsing that preserves comments, whitespace, BOM, LF/CRLF, unknown
  directives, and embedded code.
- Railroad diagrams with conservative left/right-recursion folding and Lrama standard-rule
  compaction.
- Bounded dependency views with neighborhood, reachable, whole-graph, and token-usage search.
- Diagnostics, completion, hover, definitions, references, symbols, action folding, and safe rename.
- Extract, inline, wrap, add, and reorder refactorings with action-reference renumbering and
  one-step editor Undo.
- Bison XML and Lrama conflict analysis with diagnostics, diagram status, counterexamples, and
  location navigation.

SyntaxPad requires VS Code 1.125 or newer. Open a `.y` or `.yy` file and run **SyntaxPad: Open
Grammar View**.

## Install a local build

```sh
npm install
npm run package
code --install-extension syntaxpad.vsix
```

The generated `syntaxpad.vsix` is self-contained. External parser generators remain optional.

## Settings

| Setting                          | Default       | Purpose                                      |
| -------------------------------- | ------------- | -------------------------------------------- |
| `syntaxpad.dialect`              | `bison`       | Select `yacc`, `bison`, or `lrama` behavior. |
| `syntaxpad.newRulePlacement`     | `afterSource` | Insert generated rules nearby or at the end. |
| `syntaxpad.foldActionsByDefault` | `true`        | Fold embedded actions on editor activation.  |
| `syntaxpad.tool.kind`            | `bison`       | Select the conflict-analysis adapter.        |
| `syntaxpad.tool.executable`      | selected kind | Override the parser-generator executable.    |
| `syntaxpad.tool.arguments`       | `[]`          | Add arguments without shell composition.     |
| `syntaxpad.tool.timeoutMs`       | `10000`       | Bound external execution time.               |
| `syntaxpad.tool.maxOutputKiB`    | `1024`        | Bound captured output and report data.       |

The **SyntaxPad Metrics** output channel records cursor-to-diagram, diagram-to-editor, and
refactoring application latency locally. The language-server output records diagnostics latency.

## External-tool safety

Conflict analysis is disabled in untrusted workspaces. The first run of each distinct executable and
argument configuration shows every possible invocation for confirmation. Processes receive an
argument array with `shell: false`; source and generated files stay in a permission-restricted
temporary directory, with cancellation, timeout, and output limits. Bison uses counterexample XML,
compatible XML, then verbose text in that order.

## Development

Requirements: Node.js 20 or newer and npm 10 or newer.

```sh
npm install
npm run check
npm run benchmark
```

The committed `fixtures/small/ambiguous.y` grammar is a quick conflict-analysis smoke test. Bison
uses XML when available and falls back to its verbose text report; Lrama uses its states report.

The [design](docs/design.md), [milestone demos](docs/demo-m5.md), and
[acceptance record](docs/acceptance.md) document the architecture, safety invariants, and remaining
human UX gates.
