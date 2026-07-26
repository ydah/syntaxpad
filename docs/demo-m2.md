# M2 demo — editing assistance

1. Build and launch the extension, then open `fixtures/small/calculator.y`.
2. Observe diagnostics for the intentionally unused/unreachable rule; edit an action to `$99` and an
   unknown `$name` to see positional and named-reference errors update.
3. Type `%` in declarations and rules to compare profile-aware completion. Complete a token and a
   nonterminal.
4. Hover `expression` to inspect its declaration, definition preview, and reference count.
5. Use Go to Definition / Find All References on a rule.
6. Press F2 on `expression`, rename it, and verify the definition, `%type`, all RHS uses, and named
   action references change in one undoable edit. Undo once.
7. Run **SyntaxPad: Fold Action Blocks**. Toggle `syntaxpad.foldActionsByDefault` and reopen the
   editor to verify the preference.
8. Switch `syntaxpad.dialect` among `yacc`, `bison`, and `lrama`; verify completion and `%type`
   diagnostics follow the selected profile while unknown directives remain preserved.

Automated coverage exercises completion, hover, definition/reference lookup, action-reference
diagnostics, profile-sensitive `%type`, rename patch generation, and action folding ranges.

Human UX gate S3 remains pending user execution; technical M2 checks are complete.
