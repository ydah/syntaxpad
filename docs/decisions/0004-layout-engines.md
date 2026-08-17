# ADR 0004: Specialized railroad renderer and Dagre graph layout

- Status: Accepted
- Date: 2026-07-26

## Context and rationale

Existing railroad packages do not retain action/source-range identity or raw/folded recursive forms.
This specialized model is small and domain-specific. Dependency layout is a generic, well-solved
problem; Dagre avoids a bespoke layering algorithm and is applied only after neighborhood filtering.

## Decision

Use a small SyntaxPad SVG scene graph for railroad diagrams and `@dagrejs/dagre` for dependency
graphs.

## Consequences

SyntaxPad maintains the source-ranged railroad model and SVG renderer needed by its editor
interactions. Dependency layout adds Dagre as a runtime dependency, but the extension bounds graph
size and filtering before invoking it instead of maintaining a separate layout algorithm.
