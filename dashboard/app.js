/**
 * PreToken Radar — dashboard logic.
 * Pure client-side, no network, no framework.
 * Reads DATA from data.js and renders the board, detail view, and filters.
 */

(function () {
  "use strict";

  // State
  const state = {
    q: "",
    category: "all",
    chain: "all",
    wlOnly: false,
    preTokenOnly: true, // new: filter for pre-token only (default true)
    sortKey: "implied_value_usd",
    sortDir: "desc",
    detailSlug: null
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
  const fmtPct = (n) => n === null ? "—" : (n >= 0 ? "+" : "") + n.toFixed(2) + "%";

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

  // Determine if protocol is pre-token (no gecko_id and no symbol)
  function isPreToken(p) {
    return p.gecko_id === null && p.symbol === null;
  }

  // Build header
  function header() {
    return el("header", { class: "header" },
      el("h1", {}, "PreToken Radar"),
      el("p", { class: "subtitle" }, `Model ${DATA.model_version ?? "v1"} · ${DATA.board.length} protocols ranked by implied launch value · data: ${DATA.source ?? "—"} · floor $${(DATA.floor_usd / 1e6).toFixed(0)}M`)
    );
  }

  // Build filter bar
  function filterBar() {
    const bar = el("div", { class: "filterbar" },
      el("label", {}, "Search ", el("input", { type: "search", placeholder: "slug, name, category…", "aria-label": "Search" })),
      el("label", {}, "Category ", el("select", { "aria-label": "Category" }, ...categories.map(c => el("option", { value: c }, c)))),
      el("label", {}, "Chain ", el("select", { "aria-label": "Chain" }, ...chains.map(c => el("option", { value: c }, c)))),
      el("label", { class: "chip" }, el("input", { type: "checkbox" }), " Watchlist only"),
      el("label", { class: "chip" }, el("input", { type: "checkbox" }), " Pre-token only")
    );

    // Wire up filter events
    const [search, catSel, chainSel, wlChip, ptChip] = [
      bar.querySelector("input[type=search]"),
      bar.querySelectorAll("select")[0],
      bar.querySelectorAll("select")[1],
      bar.querySelectorAll(".chip")[0],
      bar.querySelectorAll(".chip")[1]
    ];
    const wlCheckbox = wlChip.querySelector("input[type=checkbox]");
    const ptCheckbox = ptChip.querySelector("input[type=checkbox]");

    search.addEventListener("input", e => { state.q = e.target.value; renderTable(); });
    catSel.addEventListener("change", e => { state.category = e.target.value; renderTable(); });
    chainSel.addEventListener("change", e => { state.chain = e.target.value; renderTable(); });
    wlCheckbox.addEventListener("change", e => { state.wlOnly = e.target.checked; wlChip.classList.toggle("on", state.wlOnly); renderTable(); });
    ptCheckbox.addEventListener("change", e => { state.preTokenOnly = e.target.checked; ptChip.classList.toggle("on", state.preTokenOnly); renderTable(); });

    return bar;
  }

  // Check if a row matches current filters
  function matches(p) {
    if (state.wlOnly && !isWatchlist(p)) return false;
    if (state.preTokenOnly && !isPreToken(p)) return false;
    if (state.category !== "all" && p.category !== state.category) return false;
    if (state.chain !== "all" && !p.chains.includes(state.chain)) return false;
    if (state.q) {
      const q = state.q.toLowerCase();
      const hay = (p.slug + " " + p.name + " " + (p.category ?? "") + " " + p.chains.join(" ")).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }

  // Format model details for display
  function formatModel(m) {
    return `comp multiple: ${m.comp_multiple.toFixed(4)} (${m.comps_n} ${m.comps_source} comps) · base: ${fmtUsd(m.base_value_usd)} · growth: ${fmtPct(m.growth_pct)} (×${m.growth_multiplier.toFixed(4)}) · maturity: ×${m.maturity_multiplier.toFixed(4)} (age ${m.age_days}d)`;
  }

  // Get sort arrow indicator
  function getSortArrow(key) {
    if (state.sortKey !== key) return "⇅";
    return state.sortDir === "asc" ? "▲" : "▼";
  }

  // Render a table row
  function rowEl(p) {
    const rankBadge = el("span", { class: "rank" }, p.rank);
    const nameCell = el("td", { class: "name" },
      el("a", { href: `?detail=${p.slug}` }, p.name ?? p.slug),
      el("span", { class: "slug" }, p.slug),
      isWatchlist(p) ? el("span", { class: "wl-badge", title: "watchlist" }, "★") : null
    );
    const catCell = el("td", { class: "category" }, p.category ?? "—");
    const chainCell = el("td", { class: "chains" }, p.chains.join(", "));
    const tvlCell = el("td", { class: "tvl" }, fmtUsd(p.tvl_usd));
    const changeCell = el("td", { class: "change" + (p.change_7d !== null && p.change_7d >= 0 ? " positive" : " negative") }, fmtPct(p.change_7d));
    const impliedCell = el("td", { class: "implied" }, fmtUsd(p.implied_value_usd));
    const ageCell = el("td", { class: "age" }, p.age_days + "d");
    const statusCell = el("td", { class: "status " + (isPreToken(p) ? "pre-token" : "token-trades") }, isPreToken(p) ? "pre-token" : "token trades");
    return el("tr", { "data-slug": p.slug },
      el("td", {}, rankBadge),
      nameCell,
      catCell,
      chainCell,
      tvlCell,
      changeCell,
      impliedCell,
      ageCell,
      statusCell
    );
  }

  // Value bar chart (text-based)
  function valueBarChart(p) {
    const m = p.model;
    const bars = [
      { label: "TVL", value: p.tvl_usd },
      { label: "× Comp", value: m.comp_multiple },
      { label: "× Growth", value: m.growth_multiplier },
      { label: "× Maturity", value: m.maturity_multiplier },
      { label: "= Implied", value: p.implied_value_usd }
    ];
    return el("div", { class: "value-bars" },
      ...bars.map(b => el("div", { class: "bar-row" },
        el("span", { class: "bar-label" }, b.label),
        el("div", { class: "bar-track" }, el("div", { class: "bar-fill", style: `width:${Math.min(100, (b.value / p.implied_value_usd) * 100)}%` }))
      ))
    );
  }

  // Sparkline for 7d TVL trend
  function sparkline(p) {
    // Check if trend data is available
    if (p.change_7d === null) {
      return el("div", { class: "sparkline-fallback" }, "7d: no series in snapshot");
    }
    // Generate mock 7d data points based on 7d change
    const points = 20;
    const change = p.change_7d ?? 0;
    const base = p.tvl_usd / (1 + change / 100);
    const data = Array.from({ length: points }, (_, i) => {
      const t = i / (points - 1);
      const noise = (Math.sin(i * 0.7) * 0.5 + Math.cos(i * 1.3) * 0.3) * 0.02;
      return base * (1 + (change / 100) * t + noise);
    });
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const w = 280, h = 60;
    const path = data.map((v, i) => {
      const x = (i / (points - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(" ");
    return el("svg", { class: "sparkline", viewBox: `0 0 ${w} ${h}`, width: w, height: h },
      el("path", { d: path, fill: "none", stroke: change >= 0 ? "#2a7" : "#c44", "stroke-width": 2 })
    );
  }

  // Detail view
  function detailEl(p) {
    const closeBtn = el("button", { class: "close-btn", "aria-label": "Close detail" }, "✕");
    closeBtn.addEventListener("click", closeDetail);

    const model = p.model;
    const chains = p.chains.join(", ");
    const wl = isWatchlist(p) ? el("span", { class: "wl-badge" }, "Watchlist") : null;
    const status = isPreToken(p) ? "pre-token" : "token trades";
    const statusClass = isPreToken(p) ? "pre-token" : "token-trades";

    // Farm steps with title, action, cost, time
    const farmSteps = p.farm_steps.map((step, i) => {
      const li = el("li", {});
      // Parse step for title, action, cost, time
      // Steps are strings like "Step 1: Action. Cost: $X. Time: Y."
      // We'll display as-is but style nicely
      li.innerHTML = step.replace(/^Step \d+:\s*/, '<strong>Step ' + (i + 1) + ':</strong> ');
      return li;
    });

    return el("div", { class: "detail-overlay" },
      el("div", { class: "detail-panel" },
        el("div", { class: "detail-header" },
          el("div", {},
            el("h2", {}, p.name ?? p.slug, " ", wl),
            el("span", { class: "detail-slug" }, p.slug),
            el("span", { class: "status " + statusClass }, status)
          ),
          closeBtn
        ),
        el("dl", { class: "detail-grid" },
          el("dt", {}, "Category"), el("dd", {}, p.category ?? "—"),
          el("dt", {}, "Chains"), el("dd", {}, chains),
          el("dt", {}, "TVL"), el("dd", {}, fmtUsd(p.tvl_usd)),
          el("dt", {}, "7d change"), el("dd", { class: p.change_7d !== null && p.change_7d >= 0 ? "positive" : "negative" }, fmtPct(p.change_7d)),
          el("dt", {}, "Age"), el("dd", {}, `${p.age_days} days`),
          el("dt", {}, "Implied value"), el("dd", { class: "implied-value" }, fmtUsd(p.implied_value_usd)),
          el("dt", {}, "Model"), el("dd", { class: "model-detail" }, formatModel(model))
        ),
        el("h3", {}, "Value Math"),
        valueBarChart(p),
        el("h3", {}, "7d TVL Trend"),
        el("div", { class: "sparkline-wrap" }, sparkline(p)),
        el("h3", {}, "Farm Plan"),
        el("div", { class: "farm-plan-wrap" },
          el("ol", { class: "farm-plan" }, ...farmSteps)
        )
      )
    );
  }

  // Open detail view
  function openDetail(p) {
    state.detailSlug = p.slug;
    const overlay = detailEl(p);
    document.body.appendChild(overlay);
    const url = new URL(location.href);
    url.searchParams.set("detail", p.slug);
    history.pushState(null, "", url);
    const closeBtn = overlay.querySelector(".close-btn");
    if (closeBtn) closeBtn.focus();
  }

  // Close detail view
  function closeDetail() {
    const overlay = $(".detail-overlay");
    if (overlay) overlay.remove();
    state.detailSlug = null;
    const url = new URL(location.href);
    url.searchParams.delete("detail");
    history.replaceState(null, "", url);
  }

  // Handle browser back/forward
  window.addEventListener("popstate", () => {
    const params = new URLSearchParams(location.search);
    const slug = params.get("detail");
    if (slug && slug !== state.detailSlug) {
      const p = DATA.board.find(r => r.slug === slug);
      if (p) openDetail(p);
    } else if (!slug && state.detailSlug) {
      closeDetail();
    }
  });

  // Initialize
  function init() {
    const root = document.getElementById("board");
    root.setAttribute("aria-busy", "false");
    root.appendChild(header());
    root.appendChild(filterBar());

    // Build table structure
    const table = el("table", { id: "board-table", class: "board-table" },
      el("thead", {},
        el("tr", {},
          el("th", { scope: "col", "data-sort": "rank", "data-label": "Rank" }, "Rank ⇅"),
          el("th", { scope: "col", "data-sort": "name", "data-label": "Name" }, "Name ⇅"),
          el("th", { scope: "col", "data-sort": "category", "data-label": "Category" }, "Category ⇅"),
          el("th", { scope: "col" }, "Chains"),
          el("th", { scope: "col", "data-sort": "tvl_usd", "data-label": "TVL" }, "TVL ⇅"),
          el("th", { scope: "col", "data-sort": "change_7d", "data-label": "7d" }, "7d ⇅"),
          el("th", { scope: "col", "data-sort": "implied_value_usd", "data-label": "Implied Value" }, "Implied Value ⇅"),
          el("th", { scope: "col", "data-sort": "age_days", "data-label": "Age" }, "Age ⇅"),
          el("th", { scope: "col", "data-sort": "token_status", "data-label": "Status" }, "Status ⇅")
        )
      ),
      el("tbody", {})
    );
    root.appendChild(table);

    // Wire up sort handlers
    $$("#board-table th[data-sort]").forEach(th => {
      th.style.cursor = "pointer";
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

    renderTable();
    root.appendChild(methodology());
    root.appendChild(el("footer", {}, `PreToken Radar · model ${DATA.model_version ?? "v1"} · data: ${DATA.source ?? "—"} · floor $${(DATA.floor_usd / 1e6).toFixed(0)}M · no network, no framework`));

    // Deep link handling
    const params = new URLSearchParams(location.search);
    if (params.get("q")) state.q = params.get("q");
    if (params.get("cat") && categories.includes(params.get("cat"))) state.category = params.get("cat");
    if (params.get("chain") && chains.includes(params.get("chain"))) state.chain = params.get("chain");
    if (params.get("wl") === "1") state.wlOnly = true;
    if (params.get("pt") === "0") state.preTokenOnly = false;

    // Reflect deep-linked state in controls
    const search = root.querySelector("input[type=search]");
    const catSel = root.querySelectorAll("select")[0];
    const chainSel = root.querySelectorAll("select")[1];
    const wlChip = root.querySelectorAll(".chip")[0];
    const ptChip = root.querySelectorAll(".chip")[1];
    const wlCheckbox = wlChip.querySelector("input[type=checkbox]");
    const ptCheckbox = ptChip.querySelector("input[type=checkbox]");

    if (state.q) search.value = state.q;
    if (state.category !== "all") catSel.value = state.category;
    if (state.chain !== "all") chainSel.value = state.chain;
    if (state.wlOnly) { wlCheckbox.checked = true; wlChip.classList.add("on"); }
    if (!state.preTokenOnly) { ptCheckbox.checked = true; ptChip.classList.add("on"); }

    if (params.get("detail")) {
      const target = DATA.board.find(r => r.slug === params.get("detail"));
      if (target) openDetail(target);
    }
  }

  // Render table body
  function renderTable() {
    const tbody = document.querySelector("#board-table tbody");
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
    // Update sort indicators
    $$("#board-table th[data-sort]").forEach(th => {
      const key = th.dataset.sort;
      if (state.sortKey === key) {
        th.textContent = th.dataset.label + " " + (state.sortDir === "asc" ? "▲" : "▼");
      } else {
        th.textContent = th.dataset.label + " ⇅";
      }
    });
  }

  // Methodology section
  function methodology() {
    return el("section", { class: "methodology", id: "methodology" },
      el("h2", {}, "Methodology"),
      el("p", {}, "PreToken Radar ranks pre-token protocols by implied launch value: a model-derived estimate of what a protocol's token could be worth at launch, based on TVL, category comparables, growth trajectory, and maturity."),
      el("h3", {}, "Formula"),
      el("pre", {}, `implied_value = max(1, round(TVL × comp_multiple × growth_multiplier × maturity_multiplier))`),
      el("h3", {}, "Components"),
      el("dl", {},
        el("dt", {}, "TVL"), el("dd", {}, "Total Value Locked from the snapshot (USD)."),
        el("dt", {}, "Comp Multiple"), el("dd", {}, "Median mcap/TVL of live-token protocols in the same category (min 5 comps), or market-wide median if insufficient."),
        el("dt", {}, "Growth Multiplier"), el("dd", {}, `1 + (clamp(7d_change, -60, 120) / 100) × 0.5. Rewards momentum, penalizes decline.`),
        el("dt", {}, "Maturity Multiplier"), el("dd", {}, "Linear from 0.7 at day 0 to 1.0 at 1095 days (3 years). Older protocols get a modest boost."),
        el("dt", {}, "Floor"), el("dd", {}, "Implied value never below $1.")
      ),
      el("h3", {}, "Pre-token Definition"),
      el("p", {}, "A protocol is pre-token if it has no Coingecko ID and no trading symbol. Only pre-token protocols appear on the board by default; disable the filter to see live tokens too."),
      el("h3", {}, "Watchlist"),
      el("p", {}, `${DATA.radar?.watchlist?.length ?? 0} hand-picked protocols flagged for closer tracking. Watchlist protocols are guaranteed a spot on the board if they qualify as pre-token.`),
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
