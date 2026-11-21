# pretoken-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/aldapratama17/pretoken-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/aldapratama17/pretoken-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

PreToken Radar: a token launch radar for make.fun's "Build the best token launch radar" bounty ($1,325 in USDC). It reads a sealed snapshot of every protocol DefiLlama tracks, ranks the pre-token ones by an **implied launch value** priced entirely off the snapshot's own **comparables** (live-token protocols' median market-cap-to-TVL ratio per category), adjusted for 7-day TVL growth and protocol maturity (time running without a token), and writes a static, no-network dashboard with the board, a detail view per protocol, filters, and a concrete six-step farm plan for every row.

## How the model works (methodology)

The radar does not guess token prices. It calibrates an **implied value** from the snapshot's own live-token protocols:

1. **Comparables (comps)**: For each category with ≥5 live-token protocols, the model takes the median `mcap / tvl` ratio. Categories with too few comps fall back to the whole-market median, shrunk toward a base multiple of 0.6×.
2. **Base value**: `tvl_usd × category_comps_multiple`. This is the starting implied value if the protocol launched today at its category's going multiple.
3. **Growth multiplier**: 7-day TVL change is clamped to [−60%, +120%] and applied with a 0.5 weight: `growthMult = 1 + (clamped_growth_pct / 100) × 0.5`. Protocols growing fast get a modest upside; shrinking ones are not over-penalized.
4. **Maturity multiplier**: Protocols that have run longer without a token are less likely to launch soon. Age (days since `listed_at`, or 365 if unknown) maps linearly from 0.7× at day 0 to 1.0× at 1095 days (3 years): `maturityMult = 0.7 + min(age, 1095)/1095 × 0.3`.
5. **Implied value**: `round(base × growthMult × maturityMult)`, floored at $1.

Every constant is declared in `lib/model.ts` and surfaced in the dashboard; no protocol is ever special-cased.

## What makes this radar different

- **Snapshot-only calibration**: No external price feeds, no CoinGecko calls, no API keys. The multiple comes from the *same sealed snapshot* the judge evaluates, so the ranking is fully reproducible from the input bytes.
- **Category medians, not averages**: Medians resist outliers (a single 100× protocol doesn't inflate a whole category).
- **Maturity as a launch-proximity signal**: Older pre-token protocols get a *lower* multiple, not higher — the longer a protocol runs without a token, the more the market has already "priced in" its tokenlessness.
- **Watchlist floor, not ceiling**: The 40 watchlist slugs are the *minimum* coverage; the radar adds 160 early rows below that floor by TVL, finding the protocols the watchlist misses.
- **Zero-network dashboard**: `dashboard/` is pure HTML/CSS/JS reading `data.js`; it recomputes the model client-side so the numbers on the page *are* the arithmetic in `lib/model.ts`.
- **Concrete farm plans**: Every row gets a six-step, category-aware plan (capital, gas, hold time, claim instructions) — not generic advice.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /input
```

`/input` holds the sealed `snapshot.json` (pass `--input <path to snapshot.json>` instead for a local copy). The run writes `out/board.json`, `out/data.js`, `out/dashboard/`, `out/screenshots/` and `out/dossier.json`; open `out/dashboard/index.html` in a browser to read the board. Node.js 22.18 or later, standard library only.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
