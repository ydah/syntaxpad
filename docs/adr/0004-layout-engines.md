# ADR 0004: Specialized railroad renderer and Dagre graph layout

- Status: Accepted
- Date: 2026-07-26

## Decision

Use a small SyntaxPad SVG scene graph for railroad diagrams and `@dagrejs/dagre` for dependency
graphs.

## Rationale

Existing railroad packages do not retain action/source-range identity or raw/folded recursive forms.
This specialized model is small and domain-specific. Dependency layout is a generic, well-solved
problem; Dagre avoids a bespoke layering algorithm and is applied only after neighborhood filtering.
