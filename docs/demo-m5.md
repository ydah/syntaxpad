# M5 demo — release verification

1. Run `npm ci`, then `npm run check`.
2. Run `npm run benchmark`; verify both p95 values remain below the 300 ms target.
3. Run `scripts/fetch-corpus.sh` when the ignored CRuby fixture is absent. Open
   `fixtures/external/cruby-parse.y`, select `program`, and verify a railroad and distance-1 graph
   render without a parse error.
4. Search the dependency panel for a terminal name. Verify the token node and every rule using it
   appear, with degree and start-distance styling available in the SVG.
5. Set `syntaxpad.newRulePlacement` to `sectionEnd`, extract a rule, and verify the generated rule
   follows the final existing rule. Undo once.
6. Open **Output: SyntaxPad Metrics**. Move the cursor, activate a diagram node, and apply a
   refactoring. Record the reported interaction durations in `docs/ux-scenarios.md`.
7. Run `npm run package`. Inspect `syntaxpad.vsix`; it should contain the manifest, documentation,
   syntax/configuration files, and four bundled runtime assets.
8. Install the package into a disposable VS Code profile and confirm version `0.1.0`:

   ```sh
   code --install-extension syntaxpad.vsix --force \
     --extensions-dir /tmp/syntaxpad-extensions \
     --user-data-dir /tmp/syntaxpad-user-data
   ```

9. Execute S1–S5 from `docs/ux-scenarios.md`. The technical release is complete, but final UX
   acceptance remains a user decision.

## Recorded technical result (2026-07-26)

- `npm run check`: pass, 49 tests.
- Generated 10,505 lines: p95 24.49 ms.
- CRuby 16,091 lines: p95 17.01 ms; 231 rules and 0 parse errors.
- `syntaxpad.vsix`: 456.41 KB, 12 files, isolated install succeeded.
