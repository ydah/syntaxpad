# ADR 0002: Dedicated lossless parser before Tree-sitter

- Status: Accepted after M0 measurement
- Date: 2026-07-26

## Decision

Use a dedicated TypeScript scanner/parser that stores original text and source ranges. Keep a
replaceable `parseGrammar` API.

## Rationale

Tree-sitter offers excellent incremental recovery but requires a new grammar, external scanner,
native/Wasm artifact pipeline, and separate trivia/byte-preservation policy. A bounded tolerant
scanner shares the embedded-C lexical machinery and makes unknown-source pass-through direct. M0
benchmarks decide whether this remains viable.

## Trigger to reconsider

If 10,000-line p95 complete analysis exceeds 300 ms, prototype Tree-sitter and Rust/Wasm behind the
same API and record the comparison.

## M0 result

On 2026-07-26, ten full parse-plus-model runs measured p95 25.94 ms for a generated 10,505-line
grammar and p95 16.57 ms for CRuby `parse.y` (16,091 lines, upstream commit
`97d602a55f9e77bd64c2130dc0a755f657b4ce65`). The dedicated parser remains the selected approach.
