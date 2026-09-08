# Quality records

This is the append-only source of truth for measurements and acceptance reviews. Every record names
its date, measured commit, and target. If an earlier entry is wrong, append a correction instead of
rewriting history. Runtime measurements vary with the machine and run; compare trends only when the
environment is comparable.

Targets are defined in [budgets.md](budgets.md), and human scenario contracts are defined in
[scenarios.md](scenarios.md).

## 2026-07-26 — M0 technical measurement

- **Date:** 2026-07-26
- **Commit:** `1efd1a0`
- **Target:** generated and CRuby parse/model p95 within the
  [automated performance gate](budgets.md#performance-budgets), with lossless and recovery checks
  passing
- **Result:** Pass

| Workload                          | Corpus detail                                                     |   Median |      p95 |
| --------------------------------- | ----------------------------------------------------------------- | -------: | -------: |
| Generated grammar parse and model | 10,505 lines                                                      | 13.06 ms | 25.94 ms |
| CRuby `parse.y` parse and model   | 16,091 lines; upstream `97d602a55f9e77bd64c2130dc0a755f657b4ce65` |  9.99 ms | 16.57 ms |

Byte round-trip, embedded-code torture, malformed-input recovery, action-reference diagnostics, and
refactoring golden tests passed. These values correct the former M0 review row, which had mistakenly
copied the later M5 measurements.

## 2026-07-26 — M5 technical release record

- **Date:** 2026-07-26
- **Commit:** `c7feb23`
- **Target:** automated release checks and package verification pass; parser and combined-view
  workloads remain within the [performance budgets](budgets.md)
- **Result:** Technical checks passed; human UX acceptance remained pending

### Measurements and package

| Observation                                     | Result                                                                         |
| ----------------------------------------------- | ------------------------------------------------------------------------------ |
| Generated grammar parse and model               | 10,505 lines; median 13.96 ms; p95 24.49 ms                                    |
| CRuby `parse.y` parse and model                 | 16,091 lines; median 9.30 ms; p95 17.01 ms; 231 rules; no parse errors         |
| CRuby model plus railroad plus distance-1 graph | 37.22 ms                                                                       |
| Automated suite                                 | 9 test files; 49 tests                                                         |
| VSIX                                            | 12 files; 456.41 KB; isolated install succeeded as `syntaxpad.syntaxpad@0.1.0` |

### Acceptance observations

| Criterion                         | Result       | Evidence                                                                                                                                                                                    |
| --------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CRuby `parse.y` opens and renders | Pass         | The pinned corpus parsed into 231 rules without errors; `program` railroad and distance-1 dependency SVG were generated.                                                                    |
| Lossless round trip               | Pass         | Fixtures covered LF/CRLF, BOM, unknown directives, damaged input, and embedded-code torture; randomized damaged fragments remained byte-identical.                                          |
| Safe rename                       | Pass         | Definition, declarations, RHS uses, `$name`, `$[name]`, and `@name` patches were tested; comments and strings remained unchanged.                                                           |
| Structural transforms             | Pass         | Extract, Inline, and Wrap golden tests covered `$n` remapping, boundary rejection, action confirmation, configurable placement, and postconditions.                                         |
| Recursion folding                 | Pass         | Left/right optional, non-empty, separated, raw toggle, and action-bearing rejection cases were tested.                                                                                      |
| Real-time diagnostics             | Pass         | Undefined, unused, unreachable, duplicate, `%type`, `$n`, and named-action diagnostics ran through the language service with 120 ms debounce.                                               |
| Conflict ingestion and navigation | Pass         | Bison XML normalization was fixture-tested; installed Bison 2.3 exercised text fallback, and Lrama 0.7 exercised rule mapping/counterexamples; missing executables failed without throwing. |
| Bidirectional navigation budgets  | Instrumented | Cursor highlight and diagram navigation emitted measurements to **SyntaxPad Metrics**; human Extension Host timing was still required.                                                      |
| Lrama parameterized grammars      | Pass         | `%rule`, `%inline`, nested standard rules, profile directives, visualization, completion, and Lrama report ingestion were tested.                                                           |
| All five UX scenarios             | Pending user | S1–S5 required task-time and action-count review; automation could not certify usability.                                                                                                   |

## 2026-08-16 — adversarial technical audit

- **Date:** 2026-08-16
- **Commit:** `5818c60`
- **Target:** rerun the technical release procedure, verify the isolated package, complete S1–S5,
  and find release-blocking failures rather than relying on prior acceptance claims
- **Result:** **Blocked** for release acceptance

### Repeated measurements

| Observation                                     | Result                                                             |
| ----------------------------------------------- | ------------------------------------------------------------------ |
| `npm run check`                                 | Pass; 10 test files and 52 tests                                   |
| Generated grammar parse and model               | Median 15.99 ms; p95 29.46 ms                                      |
| CRuby `parse.y` parse and model                 | Median 9.64 ms; p95 17.45 ms                                       |
| CRuby model plus railroad plus distance-1 graph | p95 32.91 ms                                                       |
| VSIX                                            | 455.92 KB                                                          |
| VSIX SHA-256                                    | `8299e30051d70eea4206c9c8aa6835dc2b1752d63b34b4a73c5a076952f3e93d` |
| Isolated VS Code installation                   | Succeeded                                                          |

The repeated measurements met their technical budgets, but they are a new run rather than a
replacement for M0 or M5. Release acceptance was blocked because S1–S5 had not been performed and
the audit found known Critical/High defects, including unsafe Wrap/Inline and rename-collision edge
cases, stale or parallel external-report races, and soft timeout/process-tree termination. A passing
automated suite and install therefore did not satisfy the release target.

## 2026-09-08 — v0.1.0 release candidate

- **Date:** 2026-09-08
- **Commit:** `3f785bf`
- **Target:** repeat the automated release checks after the adversarial fixes, audit the locked
  dependencies, and verify the packaged extension in an isolated installation
- **Result:** Technical checks passed; Marketplace publisher selection and human UX acceptance
  remain pending

| Observation                       | Result                                                                |
| --------------------------------- | --------------------------------------------------------------------- |
| Locked clean install              | Pass with normal TLS certificate verification; 433 packages installed |
| Dependency audit                  | 0 known vulnerabilities                                               |
| Automated suite                   | 11 test files; 83 tests                                               |
| Generated grammar parse and model | 10,505 lines; median 25.43 ms; p95 43.30 ms                           |
| CRuby `parse.y` parse and model   | 16,091 lines; median 13.12 ms; p95 48.35 ms                           |
| VSIX                              | 12 files; 459.73 KB                                                   |
| VSIX SHA-256                      | `15cd785519fa093113ac541fec55e7c20d8563ea1a2e08db09aa5f4be44e2255`    |
| Isolated VS Code installation     | Succeeded as `syntaxpad.syntaxpad@0.1.0`                              |

The extension manifest names the `syntaxpad` Marketplace publisher, while the locally verified
publishing credential belongs to `ydah`. Resolve the permanent extension identifier before the first
Marketplace publication. S1–S5 remain required before release acceptance.

## 2026-09-08 — v0.1.0 publisher-ready candidate

- **Date:** 2026-09-08
- **Commit:** `09306a3`
- **Target:** resolve the first-release Marketplace identity and repeat the technical package checks
- **Result:** Technical checks passed; human UX acceptance remains pending

| Observation                       | Result                                                                |
| --------------------------------- | --------------------------------------------------------------------- |
| Marketplace identity              | `ydah.syntaxpad` is unused; the `ydah` publishing credential verified |
| Dependency audit                  | 0 known vulnerabilities                                               |
| Automated suite                   | 11 test files; 83 tests                                               |
| Generated grammar parse and model | 10,505 lines; median 15.27 ms; p95 28.93 ms                           |
| CRuby `parse.y` parse and model   | 16,091 lines; median 9.20 ms; p95 16.23 ms                            |
| VSIX                              | 12 files; 459.74 KB                                                   |
| VSIX SHA-256                      | `2779b81a6561c9388818ed9dc5dec9da6602ba41eebe54c16dbf929b143f5a15`    |
| Isolated VS Code installation     | Succeeded as `ydah.syntaxpad@0.1.0`                                   |

S1–S5 remain required before release acceptance. Marketplace publication and a final GitHub release
must not precede those human gates.

## Human UX review history

| Date          | Commit         | Target                                                          | Reviewer | Result  | Notes                     |
| ------------- | -------------- | --------------------------------------------------------------- | -------- | ------- | ------------------------- |
| Not performed | Not applicable | [S1](scenarios.md#s1--understand-an-unfamiliar-rule)            | User     | Pending | Human validation required |
| Not performed | Not applicable | [S2](scenarios.md#s2--add-an-alternative-and-locate-a-conflict) | User     | Pending | Human validation required |
| Not performed | Not applicable | [S3](scenarios.md#s3--rename-a-nonterminal-safely)              | User     | Pending | Human validation required |
| Not performed | Not applicable | [S4](scenarios.md#s4--extract-a-repeated-sequence)              | User     | Pending | Human validation required |
| Not performed | Not applicable | [S5](scenarios.md#s5--trace-a-token-in-a-large-grammar)         | User     | Pending | Human validation required |

Append one row for each completed scenario review. If the same scenario fails three consecutive
reviews, create an ADR reconsidering the interaction approach before continuing.
