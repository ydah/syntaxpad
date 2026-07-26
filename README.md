# SyntaxPad

SyntaxPad is a VS Code extension and language service for understanding and safely editing Bison,
Yacc, and Lrama grammar files. The `.y` file remains the only source of truth; diagrams and semantic
data are derived views.

## Development

Requirements: Node.js 20 or newer and npm 10 or newer.

```sh
npm install
npm run check
```

Run the extension with the `Run SyntaxPad Extension` launch configuration after `npm run build`.
Open a `.y` file and run **SyntaxPad: Open Grammar View**.

External conflict analysis is optional. Configure `syntaxpad.tool.kind` and
`syntaxpad.tool.executable`; the extension only runs it in a trusted workspace and asks for
confirmation before the first execution. Configured arguments are passed as an array without a
shell. Reports and generated parser files are confined to a temporary directory, execution is
time-limited, and captured output is bounded.

The committed `fixtures/small/ambiguous.y` grammar is a quick conflict-analysis smoke test. Bison
uses XML when available and falls back to its verbose text report; Lrama uses its states report. See
[docs/demo-m4.md](docs/demo-m4.md) for the complete flow.

The architecture and safety invariants are documented in [docs/design.md](docs/design.md).
