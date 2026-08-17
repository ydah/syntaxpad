# ADR 0002: Dedicated lossless parser before Tree-sitter

- Status: Accepted
- Date: 2026-07-26

## Context and rationale

Tree-sitter offers excellent incremental recovery but requires a new grammar, external scanner,
native/Wasm artifact pipeline, and separate trivia/byte-preservation policy. A bounded tolerant
scanner shares the embedded-C lexical machinery and makes unknown-source pass-through direct. The M0
benchmark gate supplied the evidence required before accepting this direction.

## Decision

Use a dedicated TypeScript scanner/parser that stores original text and source ranges. Keep a
replaceable `parseGrammar` API.

## Consequences

SyntaxPad owns and tests its grammar scanner, recovery, trivia preservation, and embedded-code
boundaries. Consumers remain isolated from that implementation by `parseGrammar`, so a measured need
can justify a later parser replacement without changing the LSP or visualization contracts.

## Evidence

Acceptance followed the 2026-07-26 M0 technical measurement at commit `1efd1a0`, against the
generated and CRuby parse/model p95 target. As frozen evidence, ten runs measured p95 25.94 ms for
the generated 10,505-line grammar and p95 16.57 ms for the 16,091-line CRuby `parse.y` at upstream
commit `97d602a55f9e77bd64c2130dc0a755f657b4ce65`. The full corpus details, medians, target, and
result are in the [M0 quality record](../quality/records.md#2026-07-26--m0-technical-measurement).

## Reconsider when

If complete analysis exceeds the [automated performance gate](../quality/budgets.md), prototype
Tree-sitter and Rust/Wasm behind the same API and record the comparison.
