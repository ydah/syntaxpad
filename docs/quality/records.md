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

## 2026-09-08 — objective portions of S1–S5

- **Date:** 2026-09-08
- **Commit:** `40d2b41`
- **Target:** execute the deterministic, headless assertions behind each human UX scenario without
  treating automation as usability acceptance
- **Result:** All objective assertions passed; the human timing, action-count, interaction, and
  usability gates remain pending

| Scenario | Objective result                                                                                                                                                       | Still requires human review                                                      |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| S1       | The medium fixture parsed without diagnostics; four railroad views rendered; the three direct `select_stmt` dependencies and all dependency modes/search rendered      | Visible selection following, keyboard navigation, elapsed time, and action count |
| S2       | Bison 2.3 reported 0 baseline conflicts and exactly 1 shift/reduce conflict after the edit; `expr` mapped to both conflict-marked views                                | Trust/confirmation UI, editor navigation, elapsed time, and action count         |
| S3       | The exact procedure input changed all seven `argument_list` targets to `call_arguments` and no other text                                                              | F2 interaction, workspace-edit inspection, one-step Undo, time, and action count |
| S4       | The valid extraction produced `named_argument ')' { use($2); }`; the invalid case returned `cross-boundary-index-reference` without a plan                             | Preview/recommendation UI, one-step Undo, elapsed time, and action count         |
| S5       | CRuby `parse.y` parsed without diagnostics; terminal search found all 13 `tIDENTIFIER` user rules; distance-2 and styled SVG views rendered in a 38.65 ms headless run | Visible large-file interaction, elapsed time, and action count                   |

These results reduce the human review to interaction quality and integration behavior. They do not
change the Pending status of the S1–S5 acceptance rows below.

## 2026-09-08 — correction to the objective S1 check

The objective S1 script for commit `40d2b41` explicitly selected the Lrama profile and therefore
missed that the default Bison profile reported `separated_nonempty_list` as undefined in the medium
fixture. The S1 row in that record is not evidence that the default-profile workflow passed. A user
review found the mismatch before release.

## 2026-09-08 — correction to the objective S5 check

The objective S5 script for commit `40d2b41` created a new neighborhood without the active search
query. It therefore did not exercise the real UI transition where a token search continued to
override Distance and the enabled control appeared to do nothing. A user review found the missing
transition before release.

## 2026-09-08 — S1 and S2 procedure correction

- **Date:** 2026-09-08
- **Commit:** `033cf32`
- **Target:** remove the default-profile error from S1 and make S2 directly reproducible
- **Result:** Automated regression checks passed; S1 and S2 still require user reruns

| Observation                    | Result                                                                                 |
| ------------------------------ | -------------------------------------------------------------------------------------- |
| S1 default Bison fixture       | Parsed 8 rules with 0 diagnostics                                                      |
| S2 Bison 2.3 fixture procedure | Baseline 0 conflicts; edited fixture 1 shift/reduce, 0 reduce/reduce, mapped to `expr` |
| Automated suite                | 11 test files; 84 tests                                                                |
| Generated grammar benchmark    | 10,505 lines; median 16.98 ms; p95 26.66 ms                                            |
| CRuby benchmark                | 16,091 lines; median 9.68 ms; p95 17.20 ms                                             |

## Human UX review history

| Date          | Commit         | Target                                                          | Reviewer | Result  | Notes                                                                                                       |
| ------------- | -------------- | --------------------------------------------------------------- | -------- | ------- | ----------------------------------------------------------------------------------------------------------- |
| Not performed | Not applicable | [S1](scenarios.md#s1--understand-an-unfamiliar-rule)            | User     | Pending | Human validation required                                                                                   |
| Not performed | Not applicable | [S2](scenarios.md#s2--add-an-alternative-and-locate-a-conflict) | User     | Pending | Human validation required                                                                                   |
| Not performed | Not applicable | [S3](scenarios.md#s3--rename-a-nonterminal-safely)              | User     | Pending | Human validation required                                                                                   |
| Not performed | Not applicable | [S4](scenarios.md#s4--extract-a-repeated-sequence)              | User     | Pending | Human validation required                                                                                   |
| Not performed | Not applicable | [S5](scenarios.md#s5--trace-a-token-in-a-large-grammar)         | User     | Pending | Human validation required                                                                                   |
| 2026-09-08    | `845e8d9`      | [S1](scenarios.md#s1--understand-an-unfamiliar-rule)            | User     | Fail    | Default Bison profile reported `separated_nonempty_list` as undefined; timing and actions were not recorded |
| 2026-09-08    | `cd8edf6`      | [S1](scenarios.md#s1--understand-an-unfamiliar-rule)            | User     | Partial | Functional behavior passed after the fixture correction; timing and actions were not recorded               |
| 2026-09-08    | `cd8edf6`      | [S2](scenarios.md#s2--add-an-alternative-and-locate-a-conflict) | User     | Partial | Conflict count and Go to expr behavior passed; timing and actions were not recorded                         |
| 2026-09-08    | `cd8edf6`      | [S3](scenarios.md#s3--rename-a-nonterminal-safely)              | User     | Partial | Rename and Undo behavior passed; timing and actions were not recorded                                       |
| 2026-09-08    | `cd8edf6`      | [S4](scenarios.md#s4--extract-a-repeated-sequence)              | User     | Partial | Valid extraction, rejection, and Undo behavior passed; timing and actions were not recorded                 |
| 2026-09-08    | `cd8edf6`      | [S5](scenarios.md#s5--trace-a-token-in-a-large-grammar)         | User     | Fail    | Distance had no visible effect while search remained active; timing and actions were not recorded           |

Append one row for each completed scenario review. If the same scenario fails three consecutive
reviews, create an ADR reconsidering the interaction approach before continuing.

## 2026-09-08 — S5 search-to-neighborhood correction

- **Date:** 2026-09-08
- **Commit:** `b35bbc8`
- **Target:** make the transition from a token search to a distance-bounded rule neighborhood
  explicit
- **Result:** Technical checks passed; S5 requires a user rerun with the updated extension

| Observation                       | Result                                                             |
| --------------------------------- | ------------------------------------------------------------------ |
| Active search                     | Distance is disabled with guidance to select a rule                |
| Referencing-rule selection        | Clears the search and enables Neighborhood distance                |
| CRuby `cname`, Distance 1 and 2   | Graph grows from 3 nodes to 7 nodes                                |
| Dependency audit                  | 0 known vulnerabilities                                            |
| Automated suite                   | 11 test files; 85 tests                                            |
| Generated grammar parse and model | 10,505 lines; median 17.26 ms; p95 31.37 ms                        |
| CRuby `parse.y` parse and model   | 16,091 lines; median 9.78 ms; p95 16.84 ms                         |
| VSIX                              | 12 files; 459.87 KB                                                |
| VSIX SHA-256                      | `e509119af42f41ae36a0ba11bd185fbd43beef64e60548682755b3091d0e5135` |
| Isolated VS Code installation     | Succeeded as `ydah.syntaxpad@0.1.0`                                |
