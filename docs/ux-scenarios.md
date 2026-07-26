# UX scenarios and gates

Automated latency is recorded by `npm run benchmark`; human task time is recorded in this file's
table during each milestone review. A milestone is not accepted until its required scenarios pass.

## Interaction budgets

| Interaction                    | Target | Hard limit | Measurement                              |
| ------------------------------ | -----: | ---------: | ---------------------------------------- |
| Cursor to diagram highlight    |  50 ms |     100 ms | extension timestamp to Webview paint ack |
| Diagram click to editor reveal |  50 ms |     100 ms | click timestamp to selection event       |
| Keystroke to diagnostics       | 300 ms |        1 s | document change to publish               |
| Refactoring application        | 200 ms |        1 s | command start to edit applied            |

## Scenarios

### S1 — Understand an unfamiliar rule

Open the medium fixture, search for `select_stmt`, inspect its railroad diagram, then follow its
three highest-use dependencies.

- Target: <= 45 s, <= 8 intentional actions, no manual line scrolling.
- Gate: M1 and later.

### S2 — Add an alternative and locate a conflict

Add the provided `expr '-' expr` alternative, run the configured generator, select the new
shift/reduce conflict, and navigate to its rule.

- Target: <= 60 s, <= 10 actions.
- Gate: M4 and later.

### S3 — Rename a nonterminal safely

Rename `argument_list` to `call_arguments`, including `$argument_list`, `$[argument_list]`, and
`@argument_list`, then undo once.

- Target: <= 30 s, <= 5 actions, zero unrelated changed lines.
- Gate: M2 and later.

### S4 — Extract a repeated sequence

Select `identifier ',' expression`, extract `named_argument`, and inspect the conflict-check
recommendation.

- Target: <= 60 s, <= 8 actions; invalid cross-boundary reference fixture must be rejected before an
  edit is applied.
- Gate: M3 and later.

### S5 — Trace a token in a large grammar

Load pinned CRuby `parse.y`, search for a token, show all referencing rules, and expand one
neighborhood to distance 2.

- Target: <= 45 s, <= 8 actions; no whole-graph layout unless explicitly selected.
- Gate: M1 and later.

## Review record

| Milestone | Date    | Reviewer | Scenarios         | Result  | Notes                     |
| --------- | ------- | -------- | ----------------- | ------- | ------------------------- |
| M0        | pending | pending  | automated budgets | pending | Run `npm run benchmark`   |
| M1        | pending | user     | S1, S5            | pending | Human validation required |
| M2        | pending | user     | S3                | pending | Human validation required |
| M3        | pending | user     | S4                | pending | Human validation required |
| M4        | pending | user     | S2                | pending | Human validation required |

If one scenario fails three consecutive reviews, create an ADR reconsidering the interaction
approach before continuing.
