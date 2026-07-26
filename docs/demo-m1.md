# M1 demo — read-only viewer

1. Run `npm run build`.
2. Start an Extension Development Host with `packages/syntaxpad-vscode` as the extension path.
3. Open `fixtures/medium/sql-subset.y`.
4. Run **SyntaxPad: Open Grammar View**.
5. Move the cursor among `select_stmt`, `expression`, and `predicate`; the selected railroad rule
   follows without reparsing the unchanged document.
6. Click or keyboard-activate a railroad nonterminal; the editor reveals its definition.
7. Select dependency distance 2, then Reachable and Whole graph. Search for `select_item`.
8. Open `fixtures/small/calculator.y`; verify `unused` and unreachable statuses are text-labelled.
9. Open a left-recursive list fixture and toggle Fold recursion; the badge is visible only for the
   folded form.
10. Fetch CRuby with `scripts/fetch-corpus.sh`, open `fixtures/external/cruby-parse.y`, and repeat
    rule search/navigation without selecting Whole graph.

Automated coverage: recursion patterns, raw/folded railroad SVG, source-range metadata, accessible
SVG controls, graph neighborhood/reachable/all filtering, undefined/unused statuses, and runtime
message-schema validation.

Human UX gates S1 and S5 remain pending user execution; technical M1 checks are complete.
