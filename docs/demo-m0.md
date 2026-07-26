# M0 demo

1. Run `npm install`.
2. Run `npm test -- --run packages/syntaxpad-core`.
3. Inspect the embedded-code torture cases and byte-round-trip tests.
4. Run `npm run benchmark`.
5. Compare the generated 10,000-line parse duration with the 300 ms target in
   `docs/ux-scenarios.md`.
6. Run the visualization tests and open their SVG snapshot to verify one rule renders.

M0 is technically complete when these automated checks pass. Human UX scenarios begin at M1.
