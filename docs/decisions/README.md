# Architecture decisions

This directory is the single index for SyntaxPad architecture decisions and the research that
supports them. Decision records explain why the system took a particular direction; current behavior
belongs in [`spec/`](../spec/).

## Decision index

| ADR  | Decision                                                                          | Status   | Date       |
| ---- | --------------------------------------------------------------------------------- | -------- | ---------- |
| 0001 | [VS Code extension platform](0001-vscode-platform.md)                             | Accepted | 2026-07-26 |
| 0002 | [Dedicated lossless parser before Tree-sitter](0002-dedicated-lossless-parser.md) | Accepted | 2026-07-26 |
| 0003 | [TypeScript core](0003-typescript-core.md)                                        | Accepted | 2026-07-26 |
| 0004 | [Specialized railroad renderer and Dagre graph layout](0004-layout-engines.md)    | Accepted | 2026-07-26 |
| 0005 | [Conservative recursion folding](0005-recursion-folding.md)                       | Accepted | 2026-07-26 |

Shared research evidence is maintained in the [prior-art review](prior-art.md).

## Record format

- Name a record `NNNN-short-title.md`, using the next unused four-digit number.
- Include `Date: YYYY-MM-DD`.
- Use exactly one status: `Proposed`, `Accepted`, `Superseded by NNNN`, or `Deprecated`.
- Start from [`template.md`](template.md) and keep Context and rationale, Decision, and Consequences
  explicit. Use Evidence and Reconsider when when they apply.
- Add every record to the decision index in this file.

## Lifecycle

A proposed record may be revised while the decision is under discussion. Once accepted, its decision
and rationale are historical evidence: do not silently rewrite them when the implementation or
preferred direction changes. Create a new ADR, explain the change there, and mark the earlier record
`Superseded by NNNN`. Use `Deprecated` when a decision no longer applies and no replacement decision
exists.

Corrections that do not change meaning should be explicit in review history. Current implementation
details must be updated in the specifications rather than retrofitted into an accepted ADR.

## Evidence and reconsideration

Measurements quoted by a decision are frozen evidence. Identify their date, measured commit, and
target, and link to the corresponding entry in the append-only
[quality records](../quality/records.md). The target itself remains canonical in the
[quality budgets](../quality/budgets.md).

If the same [UX scenario](../quality/scenarios.md) fails three consecutive reviews recorded in
[quality records](../quality/records.md#human-ux-review-history), create an ADR reconsidering that
interaction before continuing.

The [prior-art review](prior-art.md) is also append-only evidence. Add a review date and primary
source for new findings. If new evidence changes a decision, preserve the earlier finding and use a
new ADR instead of silently overwriting the decision history.
