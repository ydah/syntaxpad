# Fixtures

Small and medium fixtures are original test data under the repository MIT license.

`small/ambiguous.y` intentionally contains one shift/reduce conflict for adapter and navigation
demos.

Large upstream grammars are fetched into ignored `fixtures/external/`:

```sh
scripts/fetch-corpus.sh
```

The script pins exact upstream commits and writes source/license metadata beside each file. Do not
commit fetched files.
