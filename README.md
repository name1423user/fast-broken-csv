# fast-broken-csv

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/name1423user/fast-broken-csv/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/name1423user/fast-broken-csv/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A faster drop-in for make.fun's csv-reader 1.0.0 that returns the same `{columns, rows, errors}` for every input, including broken CSV (stray CRs, junk after closing quotes, unterminated quotes, short and long rows). Plain JavaScript, no dependencies, no WebAssembly: fields are cut with `indexOf` and `slice`, and each row is turned into JSON as soon as it is read. On the practice set it uses about a fifth of the baseline's CPU time (Node 22, one CPU).

## Run it

```sh
# answers /input/cases.json into /output/answers.json (Node 22)
node main.ts
# locally, with other directories
MAKEFUN_INPUT_DIR=<dir with cases.json> MAKEFUN_OUTPUT_DIR=<out dir> node main.ts
# compare with csv-reader 1.0.0 on generated and edge cases (needs the bounty kit in kit-dl/)
node scripts/fuzz.mjs
```

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
