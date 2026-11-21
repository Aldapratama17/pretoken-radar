// The token radar's model: comps-calibrated implied value, one snapshot in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and adds
// pre-token protocols below the watchlist floor: the early rows the radar exists to find. A protocol
// is pre-token when its index entry records no token (no market cap, no CoinGecko id, no symbol);
// the snapshot's live-token protocols are kept apart and shown as the market's own values.
//
// Implied value follows only from the snapshot's own figures, priced off its own comparables:
//
//   comps      = the live-token protocols' mcap/tvl ratios, grouped by category
//   compMult   = the category's median multiple when the category has COMP_MIN or more, else the
//                whole market's median, shrunk toward the base multiple
//   base       = tvl_usd x compMult
//   growth     = clamp(change_7d, GROWTH_FLOOR, GROWTH_CAP) per cent
//   growthMult = 1 + (growth / 100) x GROWTH_WEIGHT
//   maturity   = MATURITY_FLOOR + min(age_days, MATURITY_DAYS)/MATURITY_DAYS x MATURITY_RANGE
//                (age unknown: UNKNOWN_AGE_DAYS); a protocol that has run longer with no token is
//                read as less likely to launch soon, so its multiple is smaller
//   implied    = max(1, round(base x growthMult x maturity))
//
// CALIBRATION WATERFALL (how compMult is chosen):
//   1. Category median mcap/tvl of live-token protocols in that category (needs ≥ COMP_MIN=5)
//   2. If category has <5, fall back to whole-market median mcap/tvl of ALL live-token protocols
//   3. Shrink the fallback toward BASE_MULTIPLE=0.6 by COMPS_WEIGHT=0.6: compMult = fallback * 0.6 + base * 0.4
//   4. If no live protocols at all, use BASE_MULTIPLE directly
//
// The constants are stated in the dashboard and every row's model block carries its own inputs.
// No protocol name is ever special-cased: the same function scores every row.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  comps_min: number;
  comps_weight: number;
  base_multiple: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
}

export const MODEL: ModelConstants = {
  comps_min: 5,
  comps_weight: 0.6,
  base_multiple: 0.6,
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.7,
  maturity_range: 0.3,
  maturity_days: 1095,
  unknown_age_days: 365,
};

/** The model's version label: the dashboard names it and the dossier quotes it. */
export const MODEL_VERSION = 'comps-2';

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 160;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    comp_multiple: number;
    comps_n: number;
    comps_source: 'category' | 'market' | 'default';
    base_value_usd: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  comp_multiple: number;
  comps_n: number;
  comps_source: 'category' | 'market' | 'default';
  base_value_usd: number;
  growth_multiplier: number;
  maturity_multiplier: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  multiple: number;
}

export interface CompRow {
  category: string;
  n: number;
  median_multiple: number;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  comps: CompRow[];
  rows: RadarRow[];
  live: LiveRow[];
}

/** Builds comparable multiples per category from the snapshot's live-token protocols. */
export function buildComps(snapshot: Snapshot, model: ModelConstants = MODEL): { byCategory: CompRow[]; market: number } {
  const live = snapshot.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
  const byCategory = new Map<string, number[]>();

  for (const p of live) {
    const cat = p.category ?? 'Uncategorized';
    const mult = p.mcap_usd! / p.tvl_usd;
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(mult);
  }
  const marketMultiples: number[] = [];
  for (const arr of byCategory.values()) marketMultiples.push(...arr);
  marketMultiples.sort((a, b) => a - b);
  const marketMedian = marketMultiples.length > 0 ? marketMultiples[Math.floor(marketMultiples.length / 2)] : model.base_multiple;
  const byCategoryOut: CompRow[] = [];
  for (const [category, multiples] of byCategory) {
    multiples.sort((a, b) => a - b);
    const median = multiples[Math.floor(multiples.length / 2)];
    byCategoryOut.push({ category, n: multiples.length, median_multiple: median });
  }
  byCategoryOut.sort((a, b) => b.n - a.n);
  return { byCategory: byCategoryOut, market: marketMedian };
}

/** Builds the ranked board: watchlist first (by implied value), then early rows by TVL. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL, comps: ReturnType<typeof buildComps>): BoardRow[] {
  const preToken = snapshot.protocols.filter((p) => p.mcap_usd === null || p.mcap_usd === 0);
  const watchlistSet = new Set(snapshot.watchlist);
  const watchlistPre = preToken.filter((p) => watchlistSet.has(p.slug));
  const earlyPre = preToken.filter((p) => !watchlistSet.has(p.slug)).sort((a, b) => b.tvl_usd - a.tvl_usd).slice(0, EARLY_ROWS);
  const scored = [...watchlistPre, ...earlyPre].map((p) => scoreProtocol(p, snapshot, model, comps));
  scored.sort((a, b) => b.implied_value_usd - a.implied_value_usd);
  return scored.map((r, i) => ({ ...r, rank: i + 1 }));
}

/** Scores one pre-token protocol. */
function scoreProtocol(p: SnapshotProtocol, snapshot: Snapshot, model: ModelConstants, comps: ReturnType<typeof buildComps>): Omit<BoardRow, 'rank'> {
  const cat = p.category ?? 'Uncategorized';
  const catComp = comps.byCategory.find((c) => c.category === cat);
  let compMult: number;
  let compsN: number;
  let compsSource: 'category' | 'market' | 'default';
  if (catComp && catComp.n >= model.comps_min) {
    compMult = catComp.median_multiple;
    compsN = catComp.n;
    compsSource = 'category';
  } else if (comps.market > 0) {
    compMult = comps.market * model.comps_weight + model.base_multiple * (1 - model.comps_weight);
    compsN = comps.byCategory.reduce((sum, c) => sum + c.n, 0);
    compsSource = 'market';
  } else {
    compMult = model.base_multiple;
    compsN = 0;
    compsSource = 'default';
  }
  const base = p.tvl_usd * compMult;
  const growthPct = p.change_7d === null ? 0 : Math.min(model.growth_cap, Math.max(model.growth_floor, p.change_7d));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageDays = p.listed_at ? Math.max(0, Math.floor((Date.parse(snapshot.as_of) - Date.parse(p.listed_at)) / 86400000)) : model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageDays, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult));
  const farmSteps = farmPlan(p, implied, ageDays);
  return {
    slug: p.slug,
    name: p.name,
    category: p.category,
    chains: p.chains,
    tvl_usd: p.tvl_usd,
    change_7d: p.change_7d,
    mcap_usd: p.mcap_usd,
    listed_at: p.listed_at,
    gecko_id: p.gecko_id,
    symbol: p.symbol,
    token_status: 'pre-token',
    age_days: p.listed_at ? ageDays : null,
    implied_value_usd: implied,
    model: {
      comp_multiple: compMult,
      comps_n: compsN,
      comps_source: compsSource,
      base_value_usd: Math.round(base),
      growth_pct: growthPct,
      growth_multiplier: growthMult,
      maturity_multiplier: maturityMult,
      age_days: p.listed_at ? ageDays : null,
    },
    farm_steps: farmSteps,
  };
}

/** Generates a six-step farm plan tailored by category, TVL tier, and age. Each step combines action, cost, time into one string. */
function farmPlan(p: SnapshotProtocol, implied: number, ageDays: number): string[] {
  const chain = p.chains.length > 0 ? p.chains[0] : 'its main chain';
  const capital = implied >= 5e9 ? 300 : implied >= 1e9 ? 200 : implied >= 1e8 ? 120 : 60;
  const holdDays = ageDays < 180 ? 60 : ageDays < 365 ? 45 : 30;
  let action: string;
  const cat = (p.category || '').toLowerCase();
  const name = p.name;
  if (cat.includes('lend') || cat.includes('cdp') || cat.includes('collateral')) action = `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  else if (cat.includes('dex') || cat.includes('yield') || cat.includes('leveraged farm')) action = `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  else if (cat.includes('bridge')) action = `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  else if (cat.includes('staking') || cat.includes('restak')) action = `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  else if (cat.includes('perpetual') || cat.includes('derivative')) action = `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  else if (cat.includes('prediction')) action = `Fund $${capital} and place one market position on ${name}.`;
  else if (cat.includes('curator') || cat.includes('allocator')) action = `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  else if (cat.includes('stable')) action = `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  else if (cat.includes('rwa')) action = `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  else if (cat.includes('insurance')) action = `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  else action = `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
  const gas = capital >= 150 ? 8 : 4;
  return [
    `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline. Cost: under $3 of gas for the first transaction. Time: 5 minutes.`,
    `${action} Cost: $${capital} of capital and about $${gas} of gas. Time: 15 minutes to set up.`,
    `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote. Cost: about $2 of gas a week. Time: 10 minutes a week.`,
    `Hold the position for at least ${holdDays} days so the activity is counted in more than one snapshot. Cost: the $${capital} stays in the position. Time: ${holdDays} days.`,
    `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes. Cost: no fee to check, and never pay to claim. Time: 10 minutes.`,
    `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it. Cost: nothing but the log. Time: 5 minutes.`,
  ];
}

/** Returns live-token protocols ranked by market cap. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  const live = snapshot.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
  live.sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0));
  return live.slice(0, LIVE_ROWS).map((p) => ({
    slug: p.slug,
    name: p.name,
    category: p.category,
    chains: p.chains,
    tvl_usd: p.tvl_usd,
    mcap_usd: p.mcap_usd,
    change_7d: p.change_7d,
    multiple: p.mcap_usd! / p.tvl_usd,
  }));
}

/** Converts a BoardRow to the dashboard's RadarRow. */
function radarRow(r: BoardRow): RadarRow {
  return {
    rank: r.rank,
    slug: r.slug,
    name: r.name,
    category: r.category,
    chains: r.chains,
    tvl_usd: r.tvl_usd,
    change_7d: r.change_7d,
    mcap_usd: r.mcap_usd,
    listed_at: r.listed_at,
    age_days: r.age_days,
    implied_value_usd: r.implied_value_usd,
    comp_multiple: r.model.comp_multiple,
    comps_n: r.model.comps_n,
    comps_source: r.model.comps_source,
    base_value_usd: r.model.base_value_usd,
    growth_multiplier: r.model.growth_multiplier,
    maturity_multiplier: r.model.maturity_multiplier,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const comps = buildComps(snapshot, model);
  const board = buildBoard(snapshot, model, comps);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    comps: comps.byCategory.filter((c) => c.n >= model.comps_min),
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}

class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}
