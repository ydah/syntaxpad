# Acceptance record

This record separates automated/technical completion from the human UX gates required by the work
instruction. Measurements were taken on 2026-07-26.

## Automated and technical results

| Final criterion                   | Result       | Evidence                                                                                                                                                                                                       |
| --------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CRuby `parse.y` opens and renders | Pass         | Pinned 16,091-line file: 231 rules, 0 parse errors; `program` railroad and distance-1 dependency SVG generated in 37.22 ms.                                                                                    |
| Lossless round trip               | Pass         | Fixtures cover LF/CRLF, BOM, unknown directives, damaged input, and embedded-code torture; randomized damaged fragments remain byte-identical.                                                                 |
| Safe rename                       | Pass         | Definition, declarations, RHS uses, `$name`, `$[name]`, and `@name` patches are tested; comments and strings remain unchanged.                                                                                 |
| Structural transforms             | Pass         | Extract/Inline/Wrap golden tests cover `$n` remapping, boundary rejection, action confirmation, configurable placement, and postconditions.                                                                    |
| Recursion folding                 | Pass         | Left/right optional, non-empty, separated, raw toggle, and action-bearing rejection cases are tested.                                                                                                          |
| Real-time diagnostics             | Pass         | Undefined, unused, unreachable, duplicate, `%type`, `$n`, and named-action diagnostics run through the language service with 120 ms debounce.                                                                  |
| Conflict ingestion and navigation | Pass         | Bison XML normalization is fixture-tested. Installed Bison 2.3 exercised text fallback; Lrama 0.7 exercised rule mapping and counterexamples. Missing executables degrade to a failed report without throwing. |
| Bidirectional navigation budgets  | Instrumented | Cursor highlight and diagram navigation record target/limit results in **SyntaxPad Metrics**. Human Extension Host timing remains required.                                                                    |
| Lrama parameterized grammars      | Pass         | `%rule`, `%inline`, nested standard rules, profile directives, visualization, completion, and Lrama report ingestion are tested.                                                                               |
| All five UX scenarios             | Pending user | S1–S5 require the user's task-time/action-count review; automation cannot certify subjective usability.                                                                                                        |

## Performance and package

- Generated 10,505-line grammar: median 13.96 ms, p95 24.49 ms (300 ms target).
- CRuby `parse.y`: median 9.30 ms, p95 17.01 ms (300 ms target).
- CRuby parse + semantic model + one railroad + distance-1 graph: 37.22 ms.
- Automated suite: 9 test files, 49 tests.
- VSIX: 12 files, 456.41 KB; installed successfully as `syntaxpad.syntaxpad@0.1.0` in an isolated VS
  Code extensions directory.

## Human sign-off

Run `docs/demo-m1.md` through `docs/demo-m4.md`, record elapsed time and intentional actions in
`docs/ux-scenarios.md`, and inspect **SyntaxPad Metrics** for the interaction limits. Do not mark
the final UX criterion passed until S1–S5 meet their stated targets.
