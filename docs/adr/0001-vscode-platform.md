# ADR 0001: VS Code extension platform

- Status: Accepted
- Date: 2026-07-26

## Decision

Build a desktop VS Code extension with an LSP server and Webview panel. Keep the core and
visualization packages platform-neutral.

## Rationale

VS Code supplies high-quality text editing, undo, search, Git, accessibility, and LSP integration.
Tauri plus CodeMirror would duplicate the exact editing surface whose weakness caused the prior
prototype to fail. Desktop extension hosting is required for optional local Bison/Lrama processes;
parsing/viewing remains available in Restricted Mode.

## Consequences

The first release does not run external tools in vscode.dev. The LSP/core can later serve another
editor without moving business logic.
