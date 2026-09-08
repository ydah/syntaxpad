# Fixtures

Small and medium fixtures are original test data under the repository MIT license.

`small/ambiguous.y` intentionally contains one shift/reduce conflict for adapter and navigation
demos. `small/conflict-free.y` is the starting point for the S2 human-acceptance scenario.

Large upstream grammars are fetched into ignored `fixtures/external/`:

```sh
scripts/fetch-corpus.sh
```

The script pins exact upstream commits and writes source/license metadata beside each file. Do not
commit fetched files.
