# SyntaxPad

Open a Bison, Yacc, or Lrama `.y` file and run **SyntaxPad: Open Grammar View**.

SyntaxPad keeps your grammar text authoritative while providing live railroad and dependency views,
navigation, diagnostics, completion, safe rename, structural refactorings, and optional parser
generator conflict reports.

Conflict analysis is opt-in: it is disabled in untrusted workspaces, shows the exact command before
first execution, does not invoke a shell, and keeps generated files in a temporary directory.
