<p align="center">
  <img src="site/favicon.svg" alt="SyntaxPad logo" width="88">
</p>

<h1 align="center">SyntaxPad</h1>

<p align="center">
  <strong>VS Code tooling to visualize, analyze, and safely refactor Bison, Yacc, and Lrama grammars.</strong>
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=ydah.syntaxpad"><img src="https://img.shields.io/visual-studio-marketplace/v/ydah.syntaxpad?label=Marketplace&color=2563eb" alt="Marketplace version"></a>
  <a href="https://marketplace.visualstudio.com/items?itemName=ydah.syntaxpad"><img src="https://img.shields.io/visual-studio-marketplace/i/ydah.syntaxpad" alt="Marketplace installs"></a>
  <a href="https://github.com/ydah/syntaxpad/actions/workflows/ci.yml"><img src="https://github.com/ydah/syntaxpad/actions/workflows/ci.yml/badge.svg" alt="CI status"></a>
  <img src="https://img.shields.io/badge/VS%20Code-1.125%2B-2563eb" alt="VS Code 1.125 or newer">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License"></a>
</p>

<p align="center">
  <a href="#features">Features</a> ·
  <a href="#installation">Installation</a> ·
  <a href="#quick-start">Quick Start</a> ·
  <a href="#configuration">Configuration</a> ·
  <a href="#development">Development</a>
</p>

---

SyntaxPad turns `.y` and `.yy` files into live railroad and dependency views without replacing the
grammar as the source of truth. It keeps working with comments, embedded code, unknown directives,
and incomplete input while adding navigation, diagnostics, refactoring, and optional conflict
analysis inside VS Code.

## Features

- **Visualize:** inspect rules as railroad diagrams and explore bounded dependency graphs.
- **Navigate:** jump between definitions, references, diagnostics, diagrams, and parser conflicts.
- **Refactor:** rename, extract, inline, wrap, add, and reorder through validated, undoable edits.
- **Understand large grammars:** search token usage and expand distance-bounded neighborhoods
  without rendering the whole graph.
- **Analyze conflicts:** run Bison or Lrama on demand and map conflicts and counterexamples back to
  grammar rules.
- **Preserve source:** retain comments, whitespace, line endings, unknown directives, and embedded
  actions through lossless parsing.

## Installation

Install
[SyntaxPad from the VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=ydah.syntaxpad),
or run:

```sh
code --install-extension ydah.syntaxpad
```

### Requirements

- VS Code 1.125 or newer.
- Bison or Lrama only when using external conflict analysis.

## Quick Start

1. Open a Bison, Yacc, or Lrama `.y` or `.yy` file.
2. Open the Command Palette and run **SyntaxPad: Open Grammar View**.
3. Select a rule to inspect its railroad diagram and dependency neighborhood.
4. Click a diagram node to reveal its source or definition.

Refactoring commands are available from the Command Palette. **Extract Rule** and **Add
Alternative** also appear in the editor context menu when applicable.

## Conflict Analysis

Run **SyntaxPad: Run Conflict Analysis** to inspect conflicts from Bison or Lrama. The command is
disabled in untrusted workspaces and asks for confirmation before using a new executable or argument
configuration. Parser generators run without a shell in a temporary directory with bounded output.

These controls are not a process sandbox. Review the [security model](docs/spec/security.md) and
[external-tool limitations](docs/spec/external-tools.md#current-limitations) before running a
configured executable.

## Configuration

Configure SyntaxPad through the VS Code Settings UI.

| Setting                          | Default       | Purpose                                       |
| -------------------------------- | ------------- | --------------------------------------------- |
| `syntaxpad.dialect`              | `bison`       | Select `yacc`, `bison`, or `lrama` behavior.  |
| `syntaxpad.newRulePlacement`     | `afterSource` | Place generated helper rules.                 |
| `syntaxpad.foldActionsByDefault` | `true`        | Fold embedded action blocks on activation.    |
| `syntaxpad.tool.kind`            | `bison`       | Select the conflict-analysis generator.       |
| `syntaxpad.tool.executable`      | `""`          | Override the executable; empty uses its name. |
| `syntaxpad.tool.arguments`       | `[]`          | Add generator arguments without a shell.      |
| `syntaxpad.tool.timeoutMs`       | `10000`       | Set the external-tool timeout.                |
| `syntaxpad.tool.maxOutputKiB`    | `1024`        | Bound captured output.                        |

The [extension manifest](packages/syntaxpad-vscode/package.json) is the canonical reference for all
commands, settings, defaults, menus, and Workspace Trust restrictions.

## Documentation

- [Architecture](docs/spec/architecture.md)
- [Grammar core and limitations](docs/spec/core.md)
- [Language server](docs/spec/lsp.md)
- [Visualization and grammar view](docs/spec/visualization.md)
- [External parser-generator integration](docs/spec/external-tools.md)
- [Security model](docs/spec/security.md)

## Development

Requires Node.js 20 or newer and npm 10 or newer.

```sh
npm ci
npm run check
npm run benchmark
```

Build an installable VSIX with:

```sh
npm run package
```

## Contributing

Bug reports and pull requests are welcome in the
[GitHub repository](https://github.com/ydah/syntaxpad).

## License

SyntaxPad is released under the [MIT License](LICENSE).
