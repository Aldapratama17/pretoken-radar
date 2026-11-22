/**
 * PreToken Radar — model constants and computations.
 * All constants are declared here and surfaced in the dashboard.
 * No protocol is ever special-cased.
 */

export const MODEL_VERSION = "2026-11-21";

export const BASE_MULTIPLE = 0.6;
export const CATEGORY_MIN_COMPS = 5;
export const GROWTH_CLAMP_MIN = -60;
export const GROWTH_CLAMP_MAX = 120;
export const GROWTH_WEIGHT = 0.5;
export const MATURITY_MIN_MULT = 0.7;
export const MATURITY_MAX_MULT = 1.0;
export const MATURITY_MAX_DAYS = 1095;
export const FLOOR_VALUE = 1;
export const WATCHLIST_FLOOR_USD = 50_000_000;
export const TVL_FLOOR_USD = 5_000_000;
export const TARGET_ROWS = 200;
export const WATCHLIST_SIZE = 40;

export interface Protocol {
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

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

export interface RankedRow {
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
  symbol: null;
  token_status: "pre-token";
  age_days: number;
  implied_value_usd: number;
  model: {
    comp_multiple: number;
    comps_n: number;
    comps_source: "category" | "market";
    base_value_usd: number;
    growth_pct: number | null;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number;
  };
  farm_steps: string[];
}

export interface RadarResult {
  board: RankedRow[];
  radar: {
    early_size: number;
    live_size: number;
  };
  as_of: string;
}

/**
 * Parse the snapshot JSON.
 */
export function parseSnapshot(text: string): Snapshot {
  return JSON.parse(text) as Snapshot;
}

/**
 * Check if a protocol is pre-token (no gecko_id and no symbol).
 */
function isPreToken(p: Protocol): boolean {
  return p.gecko_id === null && p.symbol === null;
}

/**
 * Compute age in days from listed_at to snapshot as_of.
 * If listed_at is unknown, use 365 days as fallback.
 */
function computeAgeDays(listedAt: string | null, asOf: string): number {
  if (!listedAt) return 365;
  const listed = new Date(listedAt + "T00:00:00Z").getTime();
  const asOfDate = new Date(asOf + "T00:00:00Z").getTime();
  const diffMs = asOfDate - listed;
  return Math.max(0, Math.floor(diffMs / 86_400_000));
}

/**
 * Clamp growth percentage to [GROWTH_CLAMP_MIN, GROWTH_CLAMP_MAX].
 */
function clampGrowth(pct: number | null): number {
  if (pct === null) return 0;
  return Math.max(GROWTH_CLAMP_MIN, Math.min(GROWTH_CLAMP_MAX, pct));
}

/**
 * Compute growth multiplier: 1 + (clamped_pct / 100) * GROWTH_WEIGHT
 */
function growthMultiplier(pct: number | null): number {
  const clamped = clampGrowth(pct);
  return 1 + (clamped / 100) * GROWTH_WEIGHT;
}

/**
 * Compute maturity multiplier: linear from MATURITY_MIN_MULT at day 0
 * to MATURITY_MAX_MULT at MATURITY_MAX_DAYS.
 */
function maturityMultiplier(ageDays: number): number {
  const t = Math.min(ageDays, MATURITY_MAX_DAYS) / MATURITY_MAX_DAYS;
  return MATURITY_MIN_MULT + t * (MATURITY_MAX_MULT - MATURITY_MIN_MULT);
}

/**
 * Compute category comparables (median mcap/tvl) from live-token protocols.
 * Returns a map of category -> { multiple, count, source }.
 */
function computeCategoryComps(protocols: Protocol[]): Map<string, { multiple: number; count: number }> {
  const byCategory = new Map<string, number[]>();

  for (const p of protocols) {
    if (p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0) {
      const cat = p.category ?? "Uncategorized";
      const ratio = p.mcap_usd / p.tvl_usd;
      const arr = byCategory.get(cat) ?? [];
      arr.push(ratio);
      byCategory.set(cat, arr);
    }
  }

  const result = new Map<string, { multiple: number; count: number }>();
  for (const [cat, ratios] of byCategory) {
    if (ratios.length >= CATEGORY_MIN_COMPS) {
      const sorted = [...ratios].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const median = sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
      result.set(cat, { multiple: median, count: sorted.length });
    }
  }

  return result;
}

/**
 * Compute market-wide median mcap/tvl from all live-token protocols.
 */
function computeMarketMultiple(protocols: Protocol[]): { multiple: number; count: number } {
  const ratios: number[] = [];
  for (const p of protocols) {
    if (p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0) {
      ratios.push(p.mcap_usd / p.tvl_usd);
    }
  }
  if (ratios.length === 0) return { multiple: BASE_MULTIPLE, count: 0 };
  const sorted = ratios.sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
  return { multiple: median, count: ratios.length };
}

/**
 * Generate a 6-step farm plan for a protocol.
 */
function generateFarmPlan(p: Protocol, ageDays: number): string[] {
  const cat = (p.category ?? "").toLowerCase();
  const chain = p.chains[0] ?? "Ethereum";
  const isWatchlist = false; // Will be set by caller if needed

  // Capital scales with TVL tier
  let capital = 200;
  if (p.tvl_usd >= 500_000_000) capital = 200;
  else if (p.tvl_usd >= 100_000_000) capital = 200;
  else if (p.tvl_usd >= 50_000_000) capital = 200;
  else if (p.tvl_usd >= 10_000_000) capital = 100;
  else capital = 60;

  // Hold time scales with age (older = more established = longer hold)
  let holdDays = 30;
  if (ageDays >= 730) holdDays = 45;
  else if (ageDays >= 365) holdDays = 30;
  else holdDays = 30;

  // Category-aware action
  let action = "";
  if (cat.includes("lend")) {
    action = `Supply $${capital} to ${p.name}'s lending market on ${chain} and keep the position open.`;
  } else if (cat.includes("dex") || cat.includes("yield") || cat.includes("leveraged farm")) {
    action = `Provide $${capital} of liquidity to ${p.name}'s main pool on ${chain} and keep the position open.`;
  } else if (cat.includes("bridge")) {
    action = `Bridge $${capital} of USDC to ${chain} through ${p.name} and use the bridged funds in its app.`;
  } else if (cat.includes("staking") || cat.includes("restak") || cat.includes("liquid stak")) {
    action = `Stake $${capital} of the chain's staking asset through ${p.name} and keep the receipt.`;
  } else if (cat.includes("perpetual") || cat.includes("derivative")) {
    action = `Deposit $${capital} of USDC as margin on ${p.name} and open one small hedge.`;
  } else if (cat.includes("prediction")) {
    action = `Fund $${capital} and place one market position on ${p.name}.`;
  } else if (cat.includes("curator") || cat.includes("allocator")) {
    action = `Deposit $${capital} into a ${p.name} vault on ${chain} and keep the shares.`;
  } else if (cat.includes("stable") || cat.includes("cdp")) {
    action = `Mint or deposit $${capital} of the stable asset through ${p.name} on ${chain}.`;
  } else if (cat.includes("rwa")) {
    action = `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  } else if (cat.includes("insurance")) {
    action = `Buy $${capital} of cover from ${p.name} on ${chain} and keep the policy.`;
  } else {
    action = `Deposit $${capital} of USDC into ${p.name} on ${chain} and keep the position open.`;
  }

  const gasEstimate = capital >= 150 ? 8 : 4;

  return [
    `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline. Cost: under $3 of gas for the first transaction. Time: 5 minutes.`,
    `${action} Cost: $${capital} of capital and about $${gasEstimate} of gas. Time: 15 minutes to set up.`,
    `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote. Cost: about $2 of gas a week. Time: 10 minutes a week.`,
    `Hold the position for at least ${holdDays} days so the activity is counted in more than one snapshot. Cost: the $${capital} stays in the position. Time: ${holdDays} days.`,
    `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes. Cost: no fee to check, and never pay to claim. Time: 10 minutes.`,
    `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it. Cost: nothing but the log. Time: 5 minutes.`
  ];
}

/**
 * Build the radar: rank all pre-token protocols by implied value.
 */
export function buildRadar(snapshot: Snapshot): RadarResult {
  const { protocols, watchlist, as_of } = snapshot;
  const watchlistSet = new Set(watchlist);

  // Compute comparables
  const catComps = computeCategoryComps(protocols);
  const marketComp = computeMarketMultiple(protocols);

  // Separate pre-token and live-token
  const preTokenProtocols: Protocol[] = [];
  let liveSize = 0;

  for (const p of protocols) {
    if (isPreToken(p)) {
      preTokenProtocols.push(p);
    } else {
      liveSize++;
    }
  }

  // Score each pre-token protocol
  const scored = preTokenProtocols.map(p => {
    const ageDays = computeAgeDays(p.listed_at, as_of);
    const cat = p.category ?? "Uncategorized";
    const catComp = catComps.get(cat);
    const compMultiple = catComp ? catComp.multiple : marketComp.multiple;
    const compsN = catComp ? catComp.count : marketComp.count;
    const compsSource = catComp ? "category" : "market";

    const baseValue = p.tvl_usd * compMultiple;
    const gMult = growthMultiplier(p.change_7d);
    const mMult = maturityMultiplier(ageDays);
    const impliedValue = Math.max(FLOOR_VALUE, Math.round(baseValue * gMult * mMult));

    return {
      p,
      ageDays,
      compMultiple,
      compsN,
      compsSource,
      baseValue: Math.round(baseValue),
      growthPct: p.change_7d,
      gMult,
      mMult,
      impliedValue
    };
  });

  // Sort by implied value descending
  scored.sort((a, b) => b.impliedValue - a.impliedValue);

  // Build ranked rows
  const board: RankedRow[] = scored.slice(0, TARGET_ROWS).map((s, idx) => ({
    rank: idx + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: null,
    token_status: "pre-token" as const,
    age_days: s.ageDays,
    implied_value_usd: s.impliedValue,
    model: {
      comp_multiple: s.compMultiple,
      comps_n: s.compsN,
      comps_source: s.compsSource,
      base_value_usd: s.baseValue,
      growth_pct: s.growthPct,
      growth_multiplier: s.gMult,
      maturity_multiplier: s.mMult,
      age_days: s.ageDays
    },
    farm_steps: generateFarmPlan(s.p, s.ageDays)
  }));

  // Count early (not on watchlist) and watchlist
  const earlySize = board.filter(r => !watchlistSet.has(r.slug)).length;

  return {
    board,
    radar: {
      early_size: earlySize,
      live_size: liveSize
    },
    as_of
  };
}

/**
 * Validate the board meets gate requirements.
 * Returns null if valid, otherwise an error message.
 */
export function boardIssue(board: RankedRow[], snapshot: Snapshot): string | null {
  if (board.length !== TARGET_ROWS) {
    return `board must have exactly ${TARGET_ROWS} rows, got ${board.length}`;
  }

  // Check all rows are pre-token
  for (const r of board) {
    if (r.token_status !== "pre-token") {
      return `row ${r.rank} (${r.slug}) is not pre-token`;
    }
    if (r.gecko_id !== null || r.symbol !== null) {
      return `row ${r.rank} (${r.slug}) has token identifiers`;
    }
    if (r.implied_value_usd < FLOOR_VALUE) {
      return `row ${r.rank} (${r.slug}) implied value below floor`;
    }
  }

  // Check watchlist coverage
  const watchlistSet = new Set(snapshot.watchlist);
  const watchlistOnBoard = board.filter(r => watchlistSet.has(r.slug)).length;
  if (watchlistOnBoard < WATCHLIST_SIZE) {
    return `watchlist coverage ${watchlistOnBoard}/${WATCHLIST_SIZE} too low`;
  }

  // Check ranks are sequential
  for (let i = 0; i < board.length; i++) {
    if (board[i].rank !== i + 1) {
      return `rank gap at index ${i}`;
    }
  }

  // Check implied values are non-increasing
  for (let i = 1; i < board.length; i++) {
    if (board[i].implied_value_usd > board[i - 1].implied_value_usd) {
      return `implied value increases at rank ${board[i].rank}`;
    }
  }

  return null;
}

/**
 * Generate the data.js script content for the dashboard.
 */
export function dataScript(radar: RadarResult): string {
  return `// PreToken Radar data — as of ${radar.as_of}
// Model: ${MODEL_VERSION}
// No network, no framework — this file is the entire dataset.

const DATA = ${JSON.stringify(radar, null, 2)};

// Expose for the page
if (typeof window !== 'undefined') window.DATA = DATA;
if (typeof globalThis !== 'undefined') globalThis.DATA = DATA;
`;
}
