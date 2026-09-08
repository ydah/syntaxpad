# Verification procedures

These procedures are reusable checks for the current feature areas. Command and setting names come
from the extension [manifest](../../packages/syntaxpad-vscode/package.json). Record observations in
[records.md](records.md), including the date, commit, and target; do not add results to this file.

## Automated checks

1. Install the locked dependencies with `npm ci`.
2. Run `npm run check`.
3. Run `npm test -- --run packages/syntaxpad-core` and inspect the embedded-code torture,
   byte-round-trip, malformed-input recovery, action-reference diagnostic, and refactoring golden
   cases.
4. Run `npm run benchmark` and compare both parser results with the applicable release target.
5. Run the visualization tests and inspect the generated SVG coverage for a rendered grammar rule.

The automated suite covers lossless parsing, completion and diagnostics, refactoring patch safety,
report normalization, visualization, runtime message-schema validation, and package builds. It does
not replace the human scenarios in [scenarios.md](scenarios.md).

## Viewer

1. Run `npm run build` and start an Extension Development Host with `packages/syntaxpad-vscode` as
   the extension path.
2. Open `fixtures/medium/sql-subset.y` and run **SyntaxPad: Open Grammar View**.
3. Move the cursor among `select_stmt`, `expression`, and `predicate`. Verify the selected railroad
   rule follows without reparsing an unchanged document.
4. Click or keyboard-activate a railroad nonterminal and verify the editor reveals its definition.
5. Select dependency distance 2, then Reachable and Whole graph. Search for `select_item`.
6. Open `fixtures/small/calculator.y` and verify `unused` and unreachable statuses have text labels.
7. To exercise recursion folding reproducibly, save this grammar as a `.y` file, open its grammar
   view, and toggle **Fold recursion**. The badge must appear only for the folded form.

   ```yacc
   %token ITEM
   %%
   items:
       %empty
     | items ITEM
     ;
   %%
   ```

8. Run `scripts/fetch-corpus.sh` if the ignored corpus is absent. Open
   `fixtures/external/cruby-parse.y` and repeat rule search and navigation without selecting Whole
   graph.
9. Execute S1 and S5 from [scenarios.md](scenarios.md).

Relevant automated coverage includes recursion patterns, raw and folded railroad SVG, source-range
metadata, keyboard-operable SVG controls, graph neighborhood/reachable/all filtering, and
undefined/unused status rendering.

## Editing assistance

1. Build and launch the extension, then open `fixtures/small/calculator.y`.
2. Observe diagnostics for the intentionally unused or unreachable rule. Change an action to `$99`
   and add an unknown `$name`; verify positional and named-reference diagnostics update.
3. Type `%` in declarations and rules to compare profile-aware completion. Complete one token and
   one nonterminal.
4. Hover `expression` and inspect its declaration, definition preview, and reference count.
5. Use Go to Definition and Find All References on a rule.
6. Press F2 on `expression`, rename it, and verify the definition, `%type`, RHS uses, and named
   action references change in one undoable edit. Undo once.
7. Run **SyntaxPad: Fold Action Blocks**. Toggle `syntaxpad.foldActionsByDefault`, reopen the
   editor, and verify the preference.
8. Switch `syntaxpad.dialect` among `yacc`, `bison`, and `lrama`. Verify completion and `%type`
   diagnostics follow the profile while unknown directives remain preserved.
9. Run the reproducible [S3 rename procedure](#s3-rename-procedure).

Relevant automated coverage includes completion, hover, definition and reference lookup,
action-reference diagnostics, profile-sensitive `%type`, rename patch generation, and action folding
ranges.

### S3 rename procedure

Save the following disposable grammar as a `.y` file. It places `argument_list` in a `%type`
declaration, a rule definition, RHS positions, and the three named action-reference forms required
by S3.

```yacc
%locations
%token IDENTIFIER
%type <node> call argument_list
%%
call:
  IDENTIFIER '(' argument_list ')'
    { use($argument_list); use($[argument_list]); locate(@argument_list); }
;
argument_list:
  %empty
| argument_list ',' IDENTIFIER
;
%%
```

1. Set `syntaxpad.dialect` to `bison`, open the file, and place the cursor on the `argument_list`
   rule name.
2. Press F2, enter `call_arguments`, and apply the rename.
3. Inspect the single workspace edit. The `%type` declaration, definition, both RHS occurrences,
   `$argument_list`, `$[argument_list]`, and `@argument_list` must all become `call_arguments`; no
   other line may change.
4. Undo once and verify the original text is restored.

Record whether the expected edit occurred in [records.md](records.md). Do not record a pass when any
target remains unchanged or an unrelated range changes.

## Structural refactoring

1. Run the reproducible [S4 extraction procedure](#s4-extraction-procedure).
2. Select one symbol and run **SyntaxPad: Wrap in Option** under the Lrama profile. Under Bison or
   Yacc, enter a helper name and verify the generated empty/non-empty helper rule.
3. Inline a one-alternative rule that has exactly one occurrence in its caller. If it owns a final
   action, inspect and accept the warning; verify caller `$n` values are renumbered. Do not use a
   caller with repeated occurrences; that case is a documented
   [core limitation](../spec/core.md#current-limitations).
4. Run **SyntaxPad: Add Alternative** and verify inferred indentation and `|` placement.
5. Open the grammar view. Drag alternatives in the list, then repeat with **Move up/down** using the
   keyboard. Verify only the rule body changes.
6. Accept or dismiss the post-transform conflict-check prompt. Verify no external process starts
   without the separate analysis command and trust flow.

Relevant golden coverage includes `$n` remapping, boundary rejection, action-preserving inline,
style-aware helper generation, reordering, patch-overlap rejection, reparsing postconditions, and
single-edit previews.

### S4 extraction procedure

Save this disposable grammar as a `.y` file. It provides the same repeated sequence in one safe
caller and one caller whose action crosses the extraction boundary.

```yacc
%token IDENTIFIER NUMBER
%%
valid_call:
  identifier ',' expression ')' { use($4); }
;
invalid_call:
  identifier ',' expression { use($3); }
;
identifier:
  IDENTIFIER
;
expression:
  NUMBER
;
%%
```

1. In `valid_call`, select exactly `identifier ',' expression`, run **SyntaxPad: Extract Rule**, and
   enter `named_argument`.
2. Dismiss the conflict-check recommendation without running the external tool. Verify the caller is
   `named_argument ')' { use($2); }` and the new `named_argument` rule contains the selected
   sequence.
3. In `invalid_call`, select exactly the same sequence, run **SyntaxPad: Extract Rule**, and enter
   `rejected_argument`.
4. Verify the `$3` cross-boundary reference is rejected before an edit is applied. Do not treat the
   scenario as passed if any text changes during this rejected operation.
5. Undo once and verify the successful extraction from step 1 is undone and the original text is
   restored.

Record the observed preview, rejection, recommendation, and undo behavior in
[records.md](records.md); this procedure states expected behavior only.

## Conflict analysis

1. Copy `fixtures/small/conflict-free.y` to a disposable directory, open that directory in VS Code,
   open the copied `.y` file, press F1, and run **SyntaxPad: Open Grammar View**.
2. Run **SyntaxPad: Run Conflict Analysis** in an untrusted workspace. Verify the command is
   disabled and no process starts.
3. Trust the workspace and run it again. Inspect the confirmation: it must show the executable,
   generated arguments, user arguments, temporary input/output paths, and Bison text fallback.
   Cancel once and verify no process starts.
4. Accept the confirmation. The unchanged S2 grammar must report zero conflicts. With Bison 3.x,
   verify the panel identifies `bison-xml`; with an older Bison, verify the result remains usable
   through `bison-text`.
5. Follow the remaining [S2 conflict procedure](#s2-conflict-procedure). The added alternative must
   produce one shift/reduce conflict mapped to `expr`.
6. Set `syntaxpad.tool.kind` to `lrama` and configure a valid executable path. Run again and expand
   a counterexample when the installed Lrama supports it.
7. Configure a nonexistent executable. Verify the failed analysis leaves the panel and grammar
   navigation usable.
8. Change the tool arguments and rerun. Verify confirmation appears again for the new command
   signature.

Relevant automated coverage includes Bison XML state/action normalization, Bison and Lrama text
reports, counterexamples, counts-only degradation, malformed reports, bounded output, target
mapping, and conflict-status rendering.

### S2 conflict procedure

From the repository root, create and open a disposable copy of the conflict-free fixture:

```sh
mkdir -p /tmp/syntaxpad-s2
cp fixtures/small/conflict-free.y /tmp/syntaxpad-s2/scenario.y
code --profile "SyntaxPad Release Test" /tmp/syntaxpad-s2
```

The copied file contains this grammar:

```yacc
%token NUMBER
%%
expr:
  NUMBER
;
%%
```

1. Open `scenario.y`, press F1, run **SyntaxPad: Open Grammar View**, then run **SyntaxPad: Run
   Conflict Analysis**. Choose **Run** in the one-time command confirmation and verify the baseline
   notification reports `0 shift/reduce, 0 reduce/reduce`.
2. Place the editor cursor inside `expr`, press F1, and run **SyntaxPad: Add Alternative**. Press
   Esc to dismiss the immediate conflict-check recommendation because the generated alternative is
   not complete yet.
3. Replace the generated `/* TODO */` with `expr '-' expr` and save the file. The completed rule
   must read:

   ```yacc
   expr:
     NUMBER
   | expr '-' expr
   ;
   ```

4. Press F1 and run **SyntaxPad: Run Conflict Analysis** again. The notification must report
   `1 shift/reduce, 0 reduce/reduce`.
5. Verify `expr` is marked in both diagrams and has an editor diagnostic. In the conflict list,
   select **Go to expr** and verify that the editor selects the rule name.

If the baseline already has a conflict, or the added alternative does not produce exactly the
expected new conflict, record a failure in [records.md](records.md) instead of accepting S2.

## Release verification

1. Run `npm ci`, `npm run check`, and `npm run benchmark`. Compare the interaction measurements with
   [the canonical budgets](budgets.md).
2. Run `scripts/fetch-corpus.sh` if needed. Open `fixtures/external/cruby-parse.y`, select
   `program`, and verify a railroad and distance-1 graph render without a parse error.
3. Search the dependency panel for a terminal. Verify its node and every rule using it appear, with
   degree and start-distance styling in the SVG.
4. Set `syntaxpad.newRulePlacement` to `sectionEnd`, extract a rule, verify it follows the final
   existing rule, and undo once.
5. Open **Output: SyntaxPad Metrics**. Move the cursor, activate a diagram node, and apply a
   refactoring. Append the durations and the [scenario](scenarios.md) results to
   [records.md](records.md).
6. Run `npm run package`. Inspect `syntaxpad.vsix` for the manifest, published documentation,
   syntax/configuration files, and bundled runtime assets.
7. Install the package into disposable VS Code extension and user-data directories and confirm the
   installed version matches the extension manifest:

   ```sh
   code --install-extension syntaxpad.vsix --force \
     --extensions-dir /tmp/syntaxpad-extensions \
     --user-data-dir /tmp/syntaxpad-user-data
   ```

8. Execute S1–S5 from [scenarios.md](scenarios.md). Do not accept a release until every required
   human gate passes and no release-blocking defect remains.
