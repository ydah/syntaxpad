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
confirmation before the first execution.

The architecture and safety invariants are documented in [docs/design.md](docs/design.md).
