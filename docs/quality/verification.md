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
9. Execute S3 from [scenarios.md](scenarios.md).

Relevant automated coverage includes completion, hover, definition and reference lookup,
action-reference diagnostics, profile-sensitive `%type`, rename patch generation, and action folding
ranges.

## Structural refactoring

1. Open a disposable grammar containing `A B C { $$ = $3; }` in one rule.
2. Select `A B`, run **SyntaxPad: Extract Rule**, and enter `prefix`. Verify the caller becomes
   `prefix C { $$ = $2; }`, the new rule follows the source style, and one Undo restores the file.
3. Repeat with `{ $$ = $1; }`. Verify extraction is rejected before an edit because the reference
   crosses the selection boundary.
4. Select one symbol and run **SyntaxPad: Wrap in Option** under the Lrama profile. Under Bison or
   Yacc, enter a helper name and verify the generated empty/non-empty helper rule.
5. Inline a one-alternative rule. If it owns a final action, inspect and accept the warning; verify
   caller `$n` values are renumbered.
6. Run **SyntaxPad: Add Alternative** and verify inferred indentation and `|` placement.
7. Open the grammar view. Drag alternatives in the list, then repeat with **Move up/down** using the
   keyboard. Verify only the rule body changes.
8. Accept or dismiss the post-transform conflict-check prompt. Verify no external process starts
   without the separate analysis command and trust flow.
9. Execute S4 from [scenarios.md](scenarios.md).

Relevant golden coverage includes `$n` remapping, boundary rejection, action-preserving inline,
style-aware helper generation, reordering, patch-overlap rejection, reparsing postconditions, and
single-edit previews.

## Conflict analysis

1. Open `fixtures/small/ambiguous.y`, then run **SyntaxPad: Open Grammar View**.
2. Run **SyntaxPad: Run Conflict Analysis** in an untrusted workspace. Verify the command is
   disabled and no process starts.
3. Trust the workspace and run it again. Inspect the confirmation: it must show the executable,
   generated arguments, user arguments, temporary input/output paths, and Bison text fallback.
   Cancel once and verify no process starts.
4. Accept the confirmation. With Bison 3.x, verify the panel identifies `bison-xml`; with an older
   Bison, verify the result remains usable through `bison-text`. The fixture should expose one
   shift/reduce conflict.
5. Verify `expression` is marked in both diagrams, an editor diagnostic appears on its definition,
   and **Go to expression** in the conflict list selects that rule in the editor.
6. Set `syntaxpad.tool.kind` to `lrama` and configure a valid executable path. Run again and expand
   a counterexample when the installed Lrama supports it.
7. Configure a nonexistent executable. Verify the failed analysis leaves the panel and grammar
   navigation usable.
8. Change the tool arguments and rerun. Verify confirmation appears again for the new command
   signature.
9. Execute S2 from [scenarios.md](scenarios.md).

Relevant automated coverage includes Bison XML state/action normalization, Bison and Lrama text
reports, counterexamples, counts-only degradation, malformed reports, bounded output, target
mapping, and conflict-status rendering.

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
