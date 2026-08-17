# ADR 0003: TypeScript core

- Status: Accepted
- Date: 2026-07-26

## Context and rationale

One language across core, LSP, extension, and Webview shortens feedback loops and avoids a Wasm
boundary before performance evidence exists. Readonly public models and runtime validation protect
the boundaries.

## Decision

Implement the initial core in strict TypeScript.

## Consequences

Core, protocol adapters, and UI share TypeScript contracts and one build toolchain. Native or Wasm
code is not part of the initial runtime or packaging pipeline; a later hotspot can move behind an
existing public boundary if measurement justifies the added integration cost.

## Evidence

Acceptance followed the 2026-07-26 M0 technical measurement at commit `1efd1a0`, against the
generated and CRuby parse/model p95 target. The
[M0 quality record](../quality/records.md#2026-07-26--m0-technical-measurement) contains the exact
corpus sizes, medians, and p95 values behind the conclusion that the TypeScript implementation had
substantial headroom.

## Reconsider when

Move only measured parser hotspots to Rust/Wasm if the [performance gate](../quality/budgets.md)
cannot be met after algorithmic profiling.
