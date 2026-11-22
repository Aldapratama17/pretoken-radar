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
export const TARGET_ROWS = 196;  // actual pre-token opportunities after exclusion
export const WATCHLIST_SIZE = 40;

// Categories that are wrapped/bridged/staked products whose underlying token already trades
export const EXCLUDED_CATEGORIES = new Set([
  "Bridge",
  "Canonical Bridge",
  "Liquid Staking",
  "Liquid Restaking",
  "Restaked BTC",
  "CEX"
]);

// Words in protocol names that indicate wrapped/staked/bridged products
export const EXCLUDED_NAME_WORDS = [
  "wrapped",
  "staked",
  "staking",
  "liquid staking",
  "liquid restaking",
  "restaked"
];

// Exchange name prefixes
export const EXCHANGE_PREFIXES = [
  "binance",
  "coinbase",
  "bybit",
  "kraken",
  "bitget",
  "okx",
  "bitfinex",
  "gemini"
];

// Version markers in names
export const VERSION_MARKERS = [
  "v2", "v3", "v4", "v5",
  "2.0", "3.0", "4.0", "5.0",
  "v1"
];

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

/**
 * Check if a protocol should be excluded from the pre-token board
 * (wrapped/bridged/staked products, version markers, exchange prefixes).
 */
export function isExcludedFromPreTokenBoard(p: Protocol): boolean {
  const nameLower = p.name.toLowerCase();
  const cat = p.category;

  if (cat && EXCLUDED_CATEGORIES.has(cat)) return true;
  if (VERSION_MARKERS.some(vm => nameLower.includes(vm))) return true;
  if (EXCLUDED_NAME_WORDS.some(w => nameLower.includes(w))) return true;
  if (EXCHANGE_PREFIXES.some(ep => nameLower.startsWith(ep))) return true;
  return false;
}

/**
 * Check if a protocol's token already trades (has gecko_id or symbol).
 */
export function isPreToken(p: Protocol): boolean {
  return p.gecko_id === null && p.symbol === null;
}

/**
 * Check if a protocol is a pre-token opportunity (passes exclusion criteria AND has no token).
 */
export function isPreTokenOpportunity(p: Protocol): boolean {
  return isPreToken(p) && !isExcludedFromPreTokenBoard(p);
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
  return { multiple: median, count: sorted.length };
}

/**
 * Generate a 6-step farm plan tailored to protocol category and chain.
 */
function generateFarmPlan(p: Protocol, ageDays: number): string[] {
  const isBridge = (p.category ?? "").toLowerCase().includes("bridge");
  const primaryChain = p.chains[0] ?? "Ethereum";

  if (isBridge) {
    return [
      "Use a fresh hardware wallet or clean browser profile; fund gas on " + primaryChain + " only. Cost: gas. Time: 15 minutes.",
      "Bridge a test amount ($10-50) via the protocol's official UI; verify arrival on destination chain. Cost: bridge fee + gas. Time: 10 minutes.",
      "Deposit into the highest-yield pool or stake the native/LP token; enable any points/referral program. Cost: gas. Time: 10 minutes.",
      "Hold the position for 30-90 days; check weekly for incentive multipliers or new pools. Cost: gas to adjust. Time: 5 minutes/week.",
      "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes. Cost: no fee to check, and never pay to claim. Time: 10 minutes.",
      "Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it. Cost: nothing but the log. Time: 5 minutes."
    ];
  } else {
    return [
      "Use a fresh hardware wallet or clean browser profile; fund gas on " + primaryChain + " only. Cost: gas. Time: 15 minutes.",
      "Connect to the protocol's official app; deposit into the core product (lend, vault, perp, etc.). Cost: gas. Time: 10 minutes.",
      "Opt into any points, epochs or referral campaigns; add the protocol's dashboard to your weekly routine. Cost: gas to sign. Time: 5 minutes.",
      "Hold the position for 30-90 days; rebalance only if APY drops >50% or a clearly superior pool launches. Cost: gas. Time: 5 minutes/week.",
      "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes. Cost: no fee to check, and never pay to claim. Time: 10 minutes.",
      "Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it. Cost: nothing but the log. Time: 5 minutes."
    ];
  }
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

export interface AlreadyTradingRow {
  slug: string;
  name: string;
  category: string | null;
  gecko_id: string | null;
  symbol: string | null;
  tvl_usd: number;
  mcap_usd: number | null;
}

export interface RadarResult {
  board: RankedRow[];
  already_trading: AlreadyTradingRow[];
  radar: {
    early_size: number;
    live_size: number;
    excluded_pre_token: number;
    watchlist: string[];
  };
  as_of: string;
}

/**
 * Build the "Already trading (reference)" rows.
 */
function buildAlreadyTradingRows(protocols: Protocol[]): AlreadyTradingRow[] {
  return protocols
    .filter(p => p.gecko_id !== null || p.symbol !== null)
    .map(p => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      gecko_id: p.gecko_id,
      symbol: p.symbol,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd
    }))
    .sort((a, b) => b.tvl_usd - a.tvl_usd);
}

/**
 * Build the radar: rank all pre-token protocols by implied value.
 */
export function buildRadar(snapshot: Snapshot): RadarResult {
  const { protocols, watchlist, as_of } = snapshot;
  const watchlistSet = new Set(watchlist);

  // Compute comparables from ALL protocols (for mcap/TVL ratios)
  const catComps = computeCategoryComps(protocols);
  const marketComp = computeMarketMultiple(protocols);

  // Split protocols into three groups:
  // 1. Pre-token opportunities (main board candidates): pass exclusion criteria AND no token
  // 2. Already trading: have gecko_id or symbol (regardless of category)
  // 3. Excluded pre-token: fail exclusion criteria but no token (wrapped/bridged/staked without own token)
  const preTokenOpportunities: Protocol[] = [];
  const alreadyTradingProtocols: Protocol[] = [];
  let excludedPreTokenCount = 0;

  for (const p of protocols) {
    if (p.gecko_id !== null || p.symbol !== null) {
      alreadyTradingProtocols.push(p);
    } else if (isExcludedFromPreTokenBoard(p)) {
      excludedPreTokenCount++;
    } else {
      preTokenOpportunities.push(p);
    }
  }

  // Score each pre-token opportunity
  const scored = preTokenOpportunities.map(p => {
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

  // Build already trading rows
  const alreadyTrading = buildAlreadyTradingRows(alreadyTradingProtocols);

  return {
    board,
    already_trading: alreadyTrading,
    radar: {
      early_size: earlySize,
      live_size: alreadyTradingProtocols.length,
      excluded_pre_token: excludedPreTokenCount,
      watchlist: watchlist
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
  // Note: watchlist might have protocols that are excluded by our criteria
  // So we check how many watchlist protocols made it onto the board
  if (watchlistOnBoard < Math.min(WATCHLIST_SIZE, board.length)) {
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
 * Parse the snapshot JSON.
 */
export function parseSnapshot(text: string): Snapshot {
  return JSON.parse(text) as Snapshot;
}

/**
 * Generate the data.js script content for the dashboard.
 */
export function dataScript(radar: RadarResult, snapshot: Snapshot): string {
  return `// PreToken Radar data -- as of ${radar.as_of}
// Model: ${MODEL_VERSION}
// No network, no framework -- this file is the entire dataset.

const DATA = ${JSON.stringify({
    ...radar,
    model_version: MODEL_VERSION,
    floor_usd: snapshot.floor_usd,
    source: snapshot.source
  }, null, 2)};

// Expose for the page
if (typeof window !== 'undefined') window.DATA = DATA;
if (typeof globalThis !== 'undefined') globalThis.DATA = DATA;
`;
}
