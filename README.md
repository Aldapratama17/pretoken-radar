# pretoken-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/aldapratama17/pretoken-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/aldapratama17/pretoken-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

PreToken Radar: a token launch radar for make.fun's "Build the best token launch radar" bounty ($1,325 in USDC). It reads a sealed snapshot of every protocol DefiLlama tracks, ranks the pre-token ones by an implied launch value priced off the snapshot's own comparables (live-token protocols' median market-cap-to-TVL ratio per category, adjusted for 7-day growth and how long each protocol has run with no token), and writes a static, no-network dashboard with the board, a detail view per protocol, filters, and a concrete six-step farm plan for every row.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /input
```

`/input` holds the sealed `snapshot.json` (pass `--input <path to snapshot.json>` instead for a local copy). The run writes `out/board.json`, `out/data.js`, `out/dashboard/`, `out/screenshots/` and `out/dossier.json`; open `out/dashboard/index.html` in a browser to read the board. Node.js 22.18 or later, standard library only.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
