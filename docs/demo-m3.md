# M3 demo — structural refactoring

1. Open a grammar rule containing `A B C { $$ = $3; }`.
2. Select `A B`, run **SyntaxPad: Extract Rule**, and enter `prefix`. Verify the caller becomes
   `prefix C { $$ = $2; }`, the new rule follows the source rule's style, and one Undo restores the
   file.
3. Repeat with `{ $$ = $1; }`; verify extraction is rejected before an edit because the reference
   crosses the boundary.
4. Select one symbol and run **Wrap in Option** under the Lrama profile. Under Bison/Yacc, enter a
   helper name and verify the generated empty/non-empty helper rule.
5. Inline a one-alternative rule. If it owns a final action, inspect and accept the modal warning;
   verify caller `$n` values are renumbered.
6. Run **Add Alternative** and verify the inferred indentation and `|` placement.
7. Open the SyntaxPad panel. Drag alternatives in the list, then repeat using **Move up/down** with
   the keyboard. Verify only the rule body changes.
8. Accept the post-transform conflict-check prompt or dismiss it; no external process runs without
   the separate command and trust flow.

Automated golden tests cover successful `$n` remapping, boundary rejection, action-preserving
inline, style-aware helper generation, reordering, patch overlap rejection, reparsing
postconditions, and single-edit previews.

Human UX gate S4 remains pending user execution; technical M3 checks are complete.
