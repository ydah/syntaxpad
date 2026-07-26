# ADR 0005: Conservative recursion folding

- Status: Accepted
- Date: 2026-07-26

## Decision

Fold only empty/one-item plus direct left/right recursive list and separated-list forms. Disable
folding when actions or precedence annotations occur on the recursive spine.

## Rationale

These patterns cover idiomatic Yacc lists and can be explained without pretending arbitrary
recursion is repetition. The raw form is always one toggle away, and folded state is visibly
labelled.

## Consequences

Mutually recursive and action-heavy lists remain raw until a future pattern has a
language-preservation proof and fixtures.
