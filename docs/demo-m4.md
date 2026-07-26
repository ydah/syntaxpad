# M4 demo — conflict analysis and Lrama

1. Open `fixtures/small/ambiguous.y`, then open the SyntaxPad panel.
2. Run **SyntaxPad: Run Conflict Analysis**. In an untrusted workspace, verify the command is
   disabled and no process starts.
3. In a trusted workspace, inspect the modal. It must show the executable, generated arguments, user
   arguments, temporary input/output paths, and the Bison text fallback. Cancel it once and verify
   no process starts.
4. Accept the modal. With Bison 3.x, verify the panel says `bison-xml`; with older Bison, verify the
   result remains usable through `bison-text`. The fixture should report one shift/reduce conflict.
5. Verify `expression` is marked in both diagrams, an editor diagnostic appears on its definition,
   and **Go to expression** in the conflict list selects the rule in the text editor.
6. Configure `syntaxpad.tool.kind` as `lrama` and a valid executable path. Run again and expand the
   counterexample when the installed Lrama supports it.
7. Configure a nonexistent executable and verify SyntaxPad reports a failed analysis without closing
   the panel or losing grammar navigation.
8. Change tool arguments and rerun. Verify the first-run confirmation is shown again for the new
   command signature.

Automated tests cover Bison XML state/action normalization, Bison and Lrama text reports,
counterexamples, counts-only degradation, malformed reports, bounded output, target mapping, and
conflict status rendering.

Human UX gate S2 remains pending user execution; technical M4 checks are complete.
