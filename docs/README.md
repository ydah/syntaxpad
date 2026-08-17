# SyntaxPad documentation

This directory contains the engineering documentation for SyntaxPad. This file is the single entry
point: add new documents here and link them from the appropriate section below.

## Choose an entry point

- **Using SyntaxPad:** start with the [project README](../README.md). The
  [extension README](../packages/syntaxpad-vscode/README.md) is the canonical user-facing guide
  because it is published with the extension.
- **Changing the implementation:** start with the [architecture](spec/architecture.md), then read
  the specification and decision documents relevant to the package being changed.
- **Reviewing quality or a release:** start with the [quality budgets](quality/budgets.md),
  [UX scenarios](quality/scenarios.md), and [verification procedures](quality/verification.md), then
  append the outcome to the [quality records](quality/records.md).

User-facing instructions stay in the extension README, with a concise overview in the project
README. `docs/` is reserved for engineering specifications, decisions, quality contracts, and
observed results so that published usage instructions do not diverge.

## Current specification

Specifications describe the current implementation. Update them in the same change as the code; do
not add dates or retain historical alternatives in these files.

- [Architecture](spec/architecture.md)
- [Grammar core](spec/core.md)
- [Remaining design sections pending migration](design.md)
- [UI specification](ui.md)

## Decisions and research

Accepted architecture decision records are historical snapshots. Do not rewrite their decision or
rationale; supersede them with a new record. Research may be extended when new evidence affects a
decision.

- [Prior-art review](prior-art.md)
- [ADR 0001: VS Code extension platform](adr/0001-vscode-platform.md)
- [ADR 0002: Dedicated lossless parser before Tree-sitter](adr/0002-dedicated-lossless-parser.md)
- [ADR 0003: TypeScript core](adr/0003-typescript-core.md)
- [ADR 0004: Specialized railroad renderer and Dagre graph layout](adr/0004-layout-engines.md)
- [ADR 0005: Conservative recursion folding](adr/0005-recursion-folding.md)

## Quality contracts and records

Quality contracts change only when the acceptance criteria change. Records capture observations at a
date and commit and are append-only; correct a mistaken observation with a later entry rather than
silently replacing it.

- [Performance budgets](quality/budgets.md)
- [UX scenarios](quality/scenarios.md)
- [Verification procedures](quality/verification.md)
- [Quality and acceptance records](quality/records.md)

## Documentation lifecycle

| Kind             | Purpose                                    | Update trigger                       | Change rule                                  |
| ---------------- | ------------------------------------------ | ------------------------------------ | -------------------------------------------- |
| Specification    | Describe current behavior and architecture | Implementation changes               | Update with the implementation               |
| Decision         | Preserve why a choice was made             | A decision is proposed or superseded | Add or supersede; do not rewrite history     |
| Quality contract | Define budgets and acceptance scenarios    | The agreed criterion changes         | Review as an interface or requirement change |
| Record           | Capture a measurement or review result     | A check or review is performed       | Append with date, commit, and target         |

A fact has one canonical location. Other documents link to it instead of copying it. In particular:

- commands and settings come from
  [`packages/syntaxpad-vscode/package.json`](../packages/syntaxpad-vscode/package.json);
- target budgets belong to the quality contract that defines them;
- measurements belong to a dated record and identify the measured commit and target; and
- decision records may quote a measurement as frozen rationale, but must link to its full record.

Run `npm run docs:check` after changing Markdown. The command checks local file links and heading
anchors in every tracked Markdown file; `npm run check` runs it in CI as well.
