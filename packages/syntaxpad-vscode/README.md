# SyntaxPad

Open a Bison, Yacc, or Lrama `.y` file and run **SyntaxPad: Open Grammar View**.

Requires VS Code 1.125 or newer.

SyntaxPad keeps grammar text authoritative while providing live railroad and dependency views,
navigation, diagnostics, completion, safe rename, structural refactorings, and optional parser
generator conflict reports.

Use the command palette to extract or inline a rule, wrap a selection in an option/list, add an
alternative, fold actions, or run conflict analysis. Dependency search also accepts a terminal name
and displays every rule that uses it.

Conflict analysis is opt-in: it is disabled in untrusted workspaces, shows the exact command before
first execution, does not invoke a shell, keeps generated files in a temporary directory, and
enforces timeout and output limits. Configure `syntaxpad.tool.kind`, `syntaxpad.tool.executable`,
and `syntaxpad.tool.arguments` when the generator is not available on `PATH`.

The **SyntaxPad Metrics** output channel reports local interaction latency; no metrics leave VS
Code.
