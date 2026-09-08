# UX scenarios

These five scenarios are the lasting human-acceptance contract. Use the targets in
[budgets.md](budgets.md), follow the relevant procedure in [verification.md](verification.md), and
append every result to [records.md](records.md). Automated checks cannot certify subjective
usability.

## Scenarios

### S1 — Understand an unfamiliar rule

Open `fixtures/medium/sql-subset.y` with the default Bison profile, search for `select_stmt`,
inspect its railroad diagram, then follow `select_list`, `table_ref`, and `where_clause`.

- Target: <= 45 s, <= 8 intentional actions, no manual line scrolling.
- Gate: Viewer acceptance and later releases.

### S2 — Add an alternative and locate a conflict

Copy `fixtures/small/conflict-free.y` to a disposable `.y` file and follow the exact commands in the
[S2 conflict procedure](verification.md#s2-conflict-procedure). Add the provided `expr '-' expr`
alternative, run Bison, select the new shift/reduce conflict, and navigate to its rule.

- Target: <= 60 s, <= 10 actions.
- Gate: Conflict-analysis acceptance and later releases.

### S3 — Rename a nonterminal safely

Use the disposable grammar and exact steps in the
[S3 rename procedure](verification.md#s3-rename-procedure). Rename `argument_list` to
`call_arguments`, including its declaration, definition, RHS uses, `$argument_list`,
`$[argument_list]`, and `@argument_list`, then undo once.

- Target: <= 30 s, <= 5 actions, zero unrelated changed lines.
- Gate: Editing-assistance acceptance and later releases.

### S4 — Extract a repeated sequence

Use the safe and cross-boundary cases in the
[S4 extraction procedure](verification.md#s4-extraction-procedure). Select
`identifier ',' expression`, extract `named_argument`, and inspect the conflict-check
recommendation.

- Target: <= 60 s, <= 8 actions; invalid cross-boundary reference fixture must be rejected before an
  edit is applied.
- Gate: Structural-refactoring acceptance and later releases.

### S5 — Trace a token in a large grammar

Load pinned CRuby `parse.y`, search for `tIDENTIFIER`, select the referencing rule `cname`, and
expand its neighborhood from distance 1 to 2. Selecting the rule must clear the search
automatically.

- Target: <= 45 s, <= 8 actions; no whole-graph layout unless explicitly selected.
- Gate: Viewer acceptance and later releases.

If one scenario fails three consecutive reviews, create an ADR reconsidering the interaction
approach before continuing.
