/**
 * PreToken Radar -- Bold Hero Dashboard
 * Pure client-side, no network, no framework.
 * Reads DATA from data.js and renders hero cards, board, detail view, and filters.
 */

(function () {
  "use strict";

  // State
  const state = {
    q: "",
    category: "all",
    chain: "all",
    wlOnly: false,
    preTokenOnly: true,
    sortKey: "implied_value_usd",
    sortDir: "desc",
    detailSlug: null,
    showAlreadyTrading: false
  };

  // Helpers
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const el = (tag, attrs = {}, ...children) => {
    const e = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
    children.forEach(c => { if (c == null) return; e.append(c instanceof Node ? c : document.createTextNode(c)); });
    return e;
  };
  const fmt = (n) => n.toLocaleString();
  const fmtUsd = (n) => "$" + fmt(n);
  const fmtPct = (n) => n === null ? "--" : (n >= 0 ? "+" : "") + n.toFixed(2) + "%";
  const fmtCompact = (n) => {
    if (n >= 1e12) return (n / 1e12).toFixed(1).replace(/\.0$/, "") + "T";
    if (n >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, "") + "B";
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
    return fmt(n);
  };

  // Extract unique categories and chains from DATA
  const categories = ["all", ...Array.from(new Set(DATA.board.map(r => r.category ?? "Uncategorized").filter(Boolean))).sort()];
  const chains = ["all", ...Array.from(new Set(DATA.board.flatMap(r => r.chains))).sort()];

  // Watchlist set
  const watchlistSet = new Set(DATA.radar?.watchlist ?? []);

  // Chain for a protocol (first chain)
  function chainOf(p) {
    return p.chains[0] ?? "Ethereum";
  }

  // Determine if protocol is on watchlist
  function isWatchlist(p) {
    return watchlistSet.has(p.slug);
  }

  // Category chip class
  function catChipClass(cat) {
    if (!cat) return "cat-uncategorized";
    return "cat-" + cat.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  }

  // Build header
  function header() {
    const preTokenCount = DATA.board.length;
    const alreadyTradingCount = DATA.already_trading?.length ?? 0;
    const excludedCount = DATA.radar?.excluded_pre_token ?? 0;
    return el("header", { class: "header" },
      el("h1", {}, "PreToken Radar"),
      el("p", { class: "subtitle" }, 
        `Model ${DATA.model_version ?? "v1"} -- ${preTokenCount} pre-token opportunities ranked by implied launch value -- wrapped/staked/bridged products excluded -- data: ${DATA.source ?? "--"} -- floor $${(DATA.floor_usd / 1e6).toFixed(0)}M`
      ),
      el("p", { class: "footnote" }, 
        `${alreadyTradingCount} protocols with live tokens moved to "Already trading (reference)" -- ${excludedCount} wrapped/staked/bridged pre-token products excluded from ranking`
      )
    );
  }

  // Build hero section with top 3 opportunities
  function heroSection() {
    const top3 = DATA.board.slice(0, 3);
    return el("section", { class: "hero", "aria-label": "Top 3 opportunities" },
      ...top3.map((p, idx) => heroCard(p, idx + 1))
    );
  }

  // Build a single hero card
  function heroCard(p, rank) {
    const growth = p.change_7d;
    const growthClass = growth === null ? "" : (growth >= 0 ? "positive" : "negative");
    const tvl = p.tvl_usd;
    const age = p.age_days;
    const implied = p.implied_value_usd;
    const model = p.model;
    const wlBadge = isWatchlist(p) ? el("span", { class: "badge watchlist" }, "Watchlist") : null;

    // One-line why undervalued
    let why = "";
    if (model.comps_source === "category" && model.comps_n >= 5) {
      why = `Category median mcap/TVL of ${model.comp_multiple.toFixed(2)}x from ${model.comps_n} live comps`;
    } else {
      why = `Market-wide median mcap/TVL of ${model.comp_multiple.toFixed(2)}x (insufficient category comps)`;
    }
    if (growth !== null && growth > 10) {
      why += ` -- strong 7d momentum (+${growth.toFixed(1)}%)`;
    } else if (growth !== null && growth < -10) {
      why += ` -- 7d decline (${growth.toFixed(1)}%) creates entry opportunity`;
    }
    if (age > 730) {
      why += ` -- mature (${age}d)`;
    } else if (age < 180) {
      why += ` -- early stage (${age}d)`;
    }

    return el("article", { class: "hero-card", tabindex: "0", role: "button", "aria-label": `${p.name}, rank ${rank}, implied value ${fmtCompact(implied)}${wlBadge ? ", watchlist" : ""}` },
      el("div", { class: "hero-rank" }, `Rank #${rank}`),
      el("div", { class: "hero-name" },
        p.name,
        wlBadge
      ),
      el("div", { class: "hero-value" }, fmtCompact(implied)),
      el("div", { class: "hero-chips" },
        el("span", { class: "chip tv" }, `TVL ${fmtCompact(tvl)}`),
        el("span", { class: `chip growth ${growthClass}` }, `7d ${fmtPct(growth)}`),
        el("span", { class: "chip age" }, `${age}d old`)
      ),
      el("div", { class: "hero-why" },
        el("strong", {}, "Why undervalued: "), why
      )
    );
  }

  // Build filter bar
  function filterBar() {
    const bar = el("div", { class: "filterbar" },
      el("label", {}, "Search ", el("input", { type: "search", placeholder: "slug, name, category...", "aria-label": "Search protocols" })),
      el("label", {}, "Category ", el("select", { "aria-label": "Filter by category" }, ...categories.map(c => el("option", { value: c }, c === "all" ? "All categories" : c)))),
      el("label", {}, "Chain ", el("select", { "aria-label": "Filter by chain" }, ...chains.map(c => el("option", { value: c }, c === "all" ? "All chains" : c)))),
      el("label", { class: "chip-toggle" }, el("input", { type: "checkbox", "aria-label": "Watchlist only" }), " Watchlist only"),
      el("label", { class: "chip-toggle" }, el("input", { type: "checkbox", "aria-label": "Show already trading" }), " Show already trading")
    );
    return bar;
  }

  // Build table row for a board protocol
  function rowEl(p) {
    const growth = p.change_7d;
    const growthClass = growth === null ? "" : (growth >= 0 ? "positive" : "negative");
    const wl = isWatchlist(p);
    const tr = el("tr", { "data-slug": p.slug },
      el("td", { class: "rank" }, p.rank),
      el("td", { class: "name" },
        el("strong", {}, p.name),
        wl ? el("span", { class: "badge watchlist" }, "Watchlist") : null
      ),
      el("td", { class: "category" }, el("span", { class: "cat-chip " + catChipClass(p.category) }, p.category ?? "--")),
      el("td", { class: "chains" }, p.chains.join(", ") || "--"),
      el("td", { class: "tvl" }, fmtCompact(p.tvl_usd)),
      el("td", { class: `growth ${growthClass}` }, fmtPct(growth)),
      el("td", { class: "implied" }, fmtCompact(p.implied_value_usd)),
      el("td", { class: "age" }, p.age_days + "d"),
      el("td", { class: "actions" },
        el("button", { class: "btn-detail", "aria-label": `View details for ${p.name}` }, "Details")
      )
    );
    tr.addEventListener("click", e => {
      if (e.target.tagName !== "BUTTON") openDetail(p);
    });
    tr.querySelector(".btn-detail").addEventListener("click", e => {
      e.stopPropagation();
      openDetail(p);
    });
    return tr;
  }

  // Build table row for already trading protocol
  function alreadyTradingRowEl(p) {
    const tr = el("tr", { "data-slug": p.slug, class: "already-trading-row" },
      el("td", { class: "name" },
        el("strong", {}, p.name),
        el("span", { class: "badge trading" }, "Trading")
      ),
      el("td", { class: "category" }, el("span", { class: "cat-chip " + catChipClass(p.category) }, p.category ?? "--")),
      el("td", { class: "tvl" }, fmtCompact(p.tvl_usd)),
      el("td", { class: "mcap" }, p.mcap_usd !== null ? fmtCompact(p.mcap_usd) : "--"),
      el("td", { class: "symbol" }, p.symbol ?? "--"),
      el("td", { class: "gecko" }, p.gecko_id ?? "--")
    );
    return tr;
  }

  // Build board section
  function boardSection() {
    return el("section", { class: "board", id: "board" },
      el("h2", {}, "The Radar"),
      el("div", { class: "table-wrap" },
        el("table", { id: "board-table", "aria-label": "Pre-token opportunities ranked by implied value" },
          el("thead", {},
            el("tr", {},
              el("th", { "data-sort": "rank", "data-label": "Rank" }, "Rank [up/down]"),
              el("th", { "data-sort": "name", "data-label": "Protocol" }, "Protocol [up/down]"),
              el("th", { "data-sort": "category", "data-label": "Category" }, "Category [up/down]"),
              el("th", { "data-sort": "chains", "data-label": "Chains" }, "Chains"),
              el("th", { "data-sort": "tvl_usd", "data-label": "TVL" }, "TVL [up/down]"),
              el("th", { "data-sort": "change_7d", "data-label": "7d Change" }, "7d Change [up/down]"),
              el("th", { "data-sort": "implied_value_usd", "data-label": "Implied Value" }, "Implied Value [up/down]"),
              el("th", { "data-sort": "age_days", "data-label": "Age" }, "Age [up/down]"),
              el("th", {}, "Action")
            )
          ),
          el("tbody", { id: "board-tbody" })
        ),
        el("div", { class: "table-count", id: "table-count" }, "Showing 0 of " + DATA.board.length + " protocols")
      ),
      // Already trading section (collapsible)
      el("section", { class: "already-trading", id: "already-trading", style: "display:none;" },
        el("h3", { class: "collapsible-header" },
          el("span", {}, "Already trading (reference)"),
          el("button", { class: "toggle-btn", "aria-expanded": "false", "aria-controls": "already-trading-table" }, "[down]")
        ),
        el("div", { class: "table-wrap" },
          el("table", { id: "already-trading-table", "aria-label": "Protocols with live tokens (reference only)" },
            el("thead", {},
              el("tr", {},
                el("th", {}, "Protocol"),
                el("th", {}, "Category"),
                el("th", {}, "TVL"),
                el("th", {}, "Market Cap"),
                el("th", {}, "Symbol"),
                el("th", {}, "Coingecko ID")
              )
            ),
            el("tbody", { id: "already-trading-tbody" })
          )
        )
      )
    );
  }

  // Build detail modal
  function detailModal() {
    return el("section", { class: "modal", id: "detail-modal", role: "dialog", "aria-modal": "true", "aria-labelledby": "detail-title" },
      el("div", { class: "modal-backdrop" }),
      el("div", { class: "modal-content" },
        el("button", { class: "modal-close", "aria-label": "Close detail" }, "x"),
        el("div", { id: "detail-content" })
      )
    );
  }

  // Check if a protocol matches current filters
  function matches(p) {
    if (state.q) {
      const q = state.q.toLowerCase();
      const hay = (p.slug + " " + p.name + " " + (p.category ?? "")).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (state.category !== "all" && p.category !== state.category) return false;
    if (state.chain !== "all" && !p.chains.includes(state.chain)) return false;
    if (state.wlOnly && !watchlistSet.has(p.slug)) return false;
    return true;
  }

  // Open detail view
  function openDetail(p) {
    state.detailSlug = p.slug;
    const url = new URL(window.location.href);
    url.searchParams.set("detail", p.slug);
    window.history.pushState({}, "", url);
    renderDetail(p);
    document.getElementById("detail-modal").classList.add("open");
    document.body.style.overflow = "hidden";
  }

  // Close detail view
  function closeDetail() {
    state.detailSlug = null;
    const url = new URL(window.location.href);
    url.searchParams.delete("detail");
    window.history.pushState({}, "", url);
    document.getElementById("detail-modal").classList.remove("open");
    document.body.style.overflow = "";
  }

  // Render detail content
  function renderDetail(p) {
    const model = p.model;
    const growth = p.change_7d;
    const growthClass = growth === null ? "" : (growth >= 0 ? "positive" : "negative");
    const wl = isWatchlist(p);
    const container = document.getElementById("detail-content");
    container.innerHTML = "";
    container.append(
      el("header", { class: "detail-header" },
        el("div", { class: "detail-title-row" },
          el("h2", { id: "detail-title" },
            p.name,
            wl ? el("span", { class: "badge watchlist" }, "Watchlist") : null
          ),
          el("div", { class: "detail-rank" }, `Rank #${p.rank}`)
        ),
        el("div", { class: "detail-meta" },
          el("span", { class: "chip tv" }, `TVL ${fmtCompact(p.tvl_usd)}`),
          el("span", { class: `chip growth ${growthClass}` }, `7d ${fmtPct(growth)}`),
          el("span", { class: "chip age" }, `${p.age_days}d old`),
          el("span", { class: "chip cat " + catChipClass(p.category) }, p.category ?? "Uncategorized"),
          ...(p.chains.map(c => el("span", { class: "chip chain" }, c)))
        )
      ),
      el("div", { class: "detail-grid" },
        el("section", { class: "detail-card" },
          el("h3", {}, "Implied Value"),
          el("div", { class: "detail-value" }, fmtCompact(p.implied_value_usd)),
          el("p", { class: "detail-formula" }, `TVL ${fmtCompact(p.tvl_usd)} x comp ${model.comp_multiple.toFixed(2)}x x growth ${model.growth_multiplier.toFixed(2)}x x maturity ${model.maturity_multiplier.toFixed(2)}x`)
        ),
        el("section", { class: "detail-card" },
          el("h3", {}, "Model Inputs"),
          el("dl", {},
            el("dt", {}, "Comp Multiple"), el("dd", {}, `${model.comp_multiple.toFixed(2)}x (${model.comps_source === "category" ? `category median, ${model.comps_n} comps` : `market median, ${model.comps_n} comps`})`),
            el("dt", {}, "Growth (7d)"), el("dd", {}, `${growth === null ? "--" : growth.toFixed(2) + "%"} -- multiplier ${model.growth_multiplier.toFixed(2)}x`),
            el("dt", {}, "Maturity"), el("dd", {}, `${p.age_days}d -- multiplier ${model.maturity_multiplier.toFixed(2)}x`),
            el("dt", {}, "Base Value"), el("dd", {}, fmtCompact(model.base_value_usd))
          )
        )
      ),
      el("section", { class: "detail-card farm-plan" },
        el("h3", {}, "Farm Plan"),
        el("ol", {}, ...p.farm_steps.map(step => el("li", {}, step)))
      )
    );
  }

  // Initialize the page
  function init() {
    const root = document.getElementById("board");
    root.append(
      header(),
      heroSection(),
      filterBar(),
      boardSection(),
      detailModal(),
      methodology()
    );

    // Filter bar event listeners
    const search = root.querySelector("input[type=search]");
    const catSel = root.querySelectorAll("select")[0];
    const chainSel = root.querySelectorAll("select")[1];
    const wlChip = root.querySelectorAll(".chip-toggle")[0];
    const atChip = root.querySelectorAll(".chip-toggle")[1];
    const wlCheckbox = wlChip.querySelector("input[type=checkbox]");
    const atCheckbox = atChip.querySelector("input[type=checkbox]");

    search.addEventListener("input", e => {
      state.q = e.target.value;
      renderTable();
      updateUrl();
    });
    catSel.addEventListener("change", e => {
      state.category = e.target.value;
      renderTable();
      updateUrl();
    });
    chainSel.addEventListener("change", e => {
      state.chain = e.target.value;
      renderTable();
      updateUrl();
    });
    wlCheckbox.addEventListener("change", e => {
      state.wlOnly = e.target.checked;
      wlChip.classList.toggle("on", e.target.checked);
      renderTable();
      updateUrl();
    });
    atCheckbox.addEventListener("change", e => {
      state.showAlreadyTrading = e.target.checked;
      atChip.classList.toggle("on", e.target.checked);
      const atSection = document.getElementById("already-trading");
      atSection.style.display = e.target.checked ? "block" : "none";
      if (e.target.checked) renderAlreadyTradingTable();
      updateUrl();
    });

    // Sort handlers
    $$("#board-table th[data-sort]").forEach(th => {
      th.addEventListener("click", () => {
        const key = th.dataset.sort;
        if (state.sortKey === key) {
          state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
        } else {
          state.sortKey = key;
          state.sortDir = "desc";
        }
        renderTable();
      });
    });

    // Already trading toggle
    const atToggle = document.querySelector("#already-trading .toggle-btn");
    atToggle.addEventListener("click", () => {
      const expanded = atToggle.getAttribute("aria-expanded") === "true";
      atToggle.setAttribute("aria-expanded", String(!expanded));
      const tbody = document.getElementById("already-trading-tbody");
      tbody.style.display = expanded ? "none" : "";
    });

    // Modal close
    root.querySelector(".modal-close").addEventListener("click", closeDetail);
    root.querySelector(".modal-backdrop").addEventListener("click", closeDetail);
    document.addEventListener("keydown", e => { if (e.key === "Escape") closeDetail(); });

    // Deep link handling
    const params = new URLSearchParams(window.location.search);
    if (params.get("q")) state.q = params.get("q");
    if (params.get("cat") && categories.includes(params.get("cat"))) state.category = params.get("cat");
    if (params.get("chain") && chains.includes(params.get("chain"))) state.chain = params.get("chain");
    if (params.get("wl") === "1") state.wlOnly = true;
    if (params.get("at") === "1") state.showAlreadyTrading = true;

    // Reflect deep-linked state in controls
    if (state.q) search.value = state.q;
    if (state.category !== "all") catSel.value = state.category;
    if (state.chain !== "all") chainSel.value = state.chain;
    if (state.wlOnly) { wlCheckbox.checked = true; wlChip.classList.add("on"); }
    if (state.showAlreadyTrading) { atCheckbox.checked = true; atChip.classList.add("on"); 
      document.getElementById("already-trading").style.display = "block";
      renderAlreadyTradingTable();
    }

    if (params.get("detail")) {
      const target = DATA.board.find(r => r.slug === params.get("detail"));
      if (target) openDetail(target);
    }

    // Add click handlers to hero cards
    $$(".hero-card").forEach((card, idx) => {
      const p = DATA.board[idx];
      card.addEventListener("click", () => openDetail(p));
      card.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openDetail(p); } });
    });

    renderTable();
  }

  // Update URL with current filter state
  function updateUrl() {
    const url = new URL(window.location.href);
    if (state.q) url.searchParams.set("q", state.q); else url.searchParams.delete("q");
    if (state.category !== "all") url.searchParams.set("cat", state.category); else url.searchParams.delete("cat");
    if (state.chain !== "all") url.searchParams.set("chain", state.chain); else url.searchParams.delete("chain");
    if (state.wlOnly) url.searchParams.set("wl", "1"); else url.searchParams.delete("wl");
    if (state.showAlreadyTrading) url.searchParams.set("at", "1"); else url.searchParams.delete("at");
    window.history.replaceState({}, "", url);
  }

  // Render table body
  function renderTable() {
    const tbody = document.querySelector("#board-tbody");
    const filtered = DATA.board.filter(matches);
    filtered.sort((a, b) => {
      const dir = state.sortDir === "asc" ? 1 : -1;
      let av = a[state.sortKey];
      let bv = b[state.sortKey];
      if (typeof av === "string") av = av.toLowerCase();
      if (typeof bv === "string") bv = bv.toLowerCase();
      if (av == null && bv == null) return 0;
      if (av == null) return dir;
      if (bv == null) return -dir;
      if (av < bv) return -dir;
      if (av > bv) return dir;
      return 0;
    });
    tbody.innerHTML = "";
    filtered.forEach(p => tbody.appendChild(rowEl(p)));

    // Update count
    const countEl = document.getElementById("table-count");
    if (countEl) countEl.textContent = filtered.length;

    // Update sort indicators
    $$("#board-table th[data-sort]").forEach(th => {
      const key = th.dataset.sort;
      if (state.sortKey === key) {
        th.textContent = th.dataset.label + " " + (state.sortDir === "asc" ? "[up]" : "[down]");
      } else {
        th.textContent = th.dataset.label + " [up/down]";
      }
    });
  }

  // Render already trading table
  function renderAlreadyTradingTable() {
    const tbody = document.getElementById("already-trading-tbody");
    if (!tbody) return;
    tbody.innerHTML = "";
    (DATA.already_trading ?? []).forEach(p => tbody.appendChild(alreadyTradingRowEl(p)));
  }

  // Methodology section
  function methodology() {
    return el("section", { class: "methodology", id: "methodology" },
      el("h2", {}, "Methodology"),
      el("p", {}, "PreToken Radar ranks pre-token protocols by implied launch value: a model-derived estimate of what a protocol's token could be worth at launch, based on TVL, category comparables, growth trajectory, and maturity."),
      el("h3", {}, "Formula"),
      el("pre", {}, `implied_value = max(1, round(TVL x comp_multiple x growth_multiplier x maturity_multiplier))`),
      el("h3", {}, "Components"),
      el("dl", {},
        el("dt", {}, "TVL"), el("dd", {}, "Total Value Locked from the snapshot (USD)."),
        el("dt", {}, "Comp Multiple"), el("dd", {}, "Median mcap/TVL of live-token protocols in the same category (min 5 comps), or market-wide median if insufficient."),
        el("dt", {}, "Growth Multiplier"), el("dd", {}, `1 + (clamp(7d_change, -60, 120) / 100) x 0.5. Rewards momentum, penalizes decline.`),
        el("dt", {}, "Maturity Multiplier"), el("dd", {}, "Linear from 0.7 at day 0 to 1.0 at 1095 days (3 years). Older protocols get a modest boost."),
        el("dt", {}, "Floor"), el("dd", {}, "Implied value never below $1.")
      ),
      el("h3", {}, "Pre-token Definition"),
      el("p", {}, "A protocol is a pre-token opportunity if it has no Coingecko ID and no trading symbol, AND it is not a wrapped/bridged/staked product (categories: Bridge, Canonical Bridge, Liquid Staking, Liquid Restaking, Restaked BTC, CEX), does not contain version markers (V2, 2.0, etc.), does not contain wrapped/staked/staking words, and does not start with an exchange name (Binance, Coinbase, Bybit, Kraken, Bitget, OKX, Bitfinex, Gemini). Only pre-token opportunities appear on the main board; wrapped/staked/bridged products are excluded; protocols with live tokens move to \"Already trading (reference)\"."),
      el("h3", {}, "Watchlist"),
      el("p", {}, `${DATA.radar?.watchlist?.length ?? 0} hand-picked protocols flagged for closer tracking. Watchlist protocols are guaranteed a spot on the board if they qualify as pre-token opportunities. They display a "Watchlist" badge.`),
      el("h3", {}, "Farm Plan"),
      el("p", {}, "Each protocol gets a 6-step generic farm plan tailored to its category (Bridge vs non-Bridge) and primary chain. Steps cover wallet hygiene, bridging/depositing, weekly actions, holding period, claiming rewards, and logging.")
    );
  }

  // Run init when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
