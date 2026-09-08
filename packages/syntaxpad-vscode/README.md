# SyntaxPad

Open a Bison, Yacc, or Lrama `.y` file and run **SyntaxPad: Open Grammar View**.

Requires VS Code 1.125 or newer.

SyntaxPad keeps grammar text authoritative while providing live railroad and dependency views,
navigation, diagnostics, completion, rename over classified references, structural patch planning,
and optional parser-generator conflict reports.

Commands, settings, defaults, and Workspace Trust restrictions are declared in the
[extension manifest](https://github.com/ydah/syntaxpad/blob/main/packages/syntaxpad-vscode/package.json),
which is the canonical reference for the installed extension surface. Dependency search accepts a
terminal name and displays every rule that uses it.

Conflict analysis is opt-in: it is disabled in untrusted workspaces, confirms a new tool
configuration, runs without a shell, and bounds captured output. This is not a process sandbox, and
timeout is a soft termination request. Read the canonical
[security model](https://github.com/ydah/syntaxpad/blob/main/docs/spec/security.md) before enabling
a configured executable.

The current implementation has documented encoding, rename, transform, and external-run limitations.
Review the
[core limitations](https://github.com/ydah/syntaxpad/blob/main/docs/spec/core.md#current-limitations)
before relying on transformations for critical grammars.

The **SyntaxPad Metrics** output channel reports local interaction latency; no metrics leave VS
Code.
