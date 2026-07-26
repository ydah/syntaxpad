# M0 demo

1. Run `npm install`.
2. Run `npm test -- --run packages/syntaxpad-core`.
3. Inspect the embedded-code torture cases and byte-round-trip tests.
4. Run `npm run benchmark`.
5. Compare the generated 10,000-line parse duration with the 300 ms target in
   `docs/ux-scenarios.md`.
6. Run the visualization tests and open their SVG snapshot to verify one rule renders.

M0 is technically complete when these automated checks pass. Human UX scenarios begin at M1.

## Recorded result (2026-07-26)

- Generated 10,505-line grammar: median 13.06 ms, p95 25.94 ms.
- CRuby `parse.y` at `97d602a55f9e77bd64c2130dc0a755f657b4ce65` (16,091 lines): median 9.99 ms, p95
  16.57 ms.
- Byte round-trip, embedded-code torture, malformed-input recovery, action-reference diagnostics,
  and refactoring golden tests pass.
