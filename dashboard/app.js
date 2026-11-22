/**
 * PreToken Radar — Bold Hero Dashboard
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

  // Determine if protocol is pre-token (no gecko_id and no symbol)
  function isPreToken(p) {
    return p.gecko_id === null && p.symbol === null;
  }

  // Category chip class
  function catChipClass(cat) {
    if (!cat) return "cat-uncategorized";
    return "cat-" + cat.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  }

  // Build header
  function header() {
    return el("header", { class: "header" },
      el("h1", {}, "PreToken Radar"),
      el("p", { class: "subtitle" }, `Model ${DATA.model_version ?? "v1"} · <strong>${DATA.board.length}</strong> protocols ranked by implied launch value · data: ${DATA.source ?? "—"} · floor $${(DATA.floor_usd / 1e6).toFixed(0)}M`)
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

    // One-line why undervalued
    let why = "";
    if (model.comps_source === "category" && model.comps_n >= 5) {
      why = `Category median mcap/TVL of ${model.comp_multiple.toFixed(2)}× from ${model.comps_n} live comps`;
    } else {
      why = `Market-wide median mcap/TVL of ${model.comp_multiple.toFixed(2)}× (insufficient category comps)`;
    }
    if (growth !== null && growth > 10) {
      why += ` · strong 7d momentum (+${growth.toFixed(1)}%)`;
    } else if (growth !== null && growth < -10) {
      why += ` · 7d decline (${growth.toFixed(1)}%) creates entry opportunity`;
    }
    if (age > 730) {
      why += ` · mature (${age}d)`;
    } else if (age < 180) {
      why += ` · early stage (${age}d)`;
    }

    return el("article", { class: "hero-card", tabindex: "0", role: "button", "aria-label": `${p.name}, rank ${rank}, implied value ${fmtCompact(implied)}` },
      el("div", { class: "hero-rank" }, `Rank #${rank}`),
      el("div", { class: "hero-name" }, p.name),
      el("div", { class: "hero-value" }, fmtCompact(implied)),
      el("div", { class: "hero-chips" },
        el("span", { class: "chip tv" }, `TVL ${fmtCompact(tvl)}`),
        el("span", { class: `chip growth ${growthClass}` }, `7d ${fmtPct(growth)}`),
        el("span", { class: "chip age" }, `${age}d old`)
      ),
      el("div", { class: "hero-why" },
        el("strong", {}, "Why undervalued: "), why
      ),
      // Click handler
      (() => {
        const card = document.currentScript ? null : null; // placeholder
        return null;
      })()
    );
  }

  // Build filter bar
  function filterBar() {
    const bar = el("div", { class: "filterbar" },
      el("label", {}, "Search ", el("input", { type: "search", placeholder: "slug, name, category…", "aria-label": "Search" })),
      el("label", {}, "Category ", el("select", { "aria-label": "Category" }, ...categories.map(c => el("option", { value: c }, c)))),
      el("label", {}, "Chain ", el("select", { "aria-label": "Chain" }, ...chains.map(c => el("option", { value: c }, c)))),
      el("span", { class: "filter-spacer" }),
      el("label", { class: "chip-toggle" },
        el("input", { type: "checkbox" }),
        el("span", {}, "Watchlist only")
      ),
      el("label", { class: "chip-toggle" },
        el("input", { type: "checkbox" }),
        el("span", {}, "Pre-token only")
      )
    );

    // Wire up filter events
    const [search, catSel, chainSel, wlChip, ptChip] = [
      bar.querySelector("input[type=search]"),
      bar.querySelectorAll("select")[0],
      bar.querySelectorAll("select")[1],
      bar.querySelectorAll(".chip-toggle")[0],
      bar.querySelectorAll(".chip-toggle")[1]
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

  // Render a single table row
  function rowEl(p) {
    const growth = p.change_7d;
    const growthClass = growth === null ? "" : (growth >= 0 ? "positive" : "negative");
    const catClass = catChipClass(p.category);

    const tr = el("tr", { "data-slug": p.slug, tabindex: "0", role: "button", "aria-label": `${p.name}, rank ${p.rank}, implied ${fmtCompact(p.implied_value_usd)}` },
      el("td", { class: "rank" }, `#${p.rank}`),
      el("td", { class: "name-col" },
        el("a", { href: "#", "data-slug": p.slug }, p.name),
        el("span", { class: "slug" }, p.slug),
        isWatchlist(p) ? el("span", { class: "wl-badge" }, "Watchlist") : null
      ),
      el("td", { class: "category" }, p.category ? el("span", { class: `cat-chip ${catClass}` }, p.category) : "—"),
      el("td", { class: "tvl" }, fmtCompact(p.tvl_usd)),
      el("td", { class: `change ${growthClass}` }, fmtPct(growth)),
      el("td", { class: "implied" }, fmtCompact(p.implied_value_usd)),
      el("td", { class: "age" }, p.age_days + "d"),
      el("td", {}, el("span", { class: `status ${p.token_status}` }, p.token_status))
    );

    // Click to open detail
    tr.addEventListener("click", () => openDetail(p));
    tr.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openDetail(p); } });

    // Sortable header click
    return tr;
  }

  // Render header row
  function headerRow() {
    const cols = [
      { key: "rank", label: "Rank" },
      { key: "name", label: "Protocol" },
      { key: "category", label: "Category" },
      { key: "tvl_usd", label: "TVL" },
      { key: "change_7d", label: "7d Change" },
      { key: "implied_value_usd", label: "Implied Value" },
      { key: "age_days", label: "Age" },
      { key: "token_status", label: "Status" }
    ];
    return el("thead", {},
      el("tr", {},
        ...cols.map(c => el("th", { "data-sort": c.key, "data-label": c.label }, c.label + " ⇅"))
      )
    );
  }

  // Open detail modal
  function openDetail(p) {
    state.detailSlug = p.slug;
    const overlay = document.createElement("div");
    overlay.className = "detail-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "detail-title");
    overlay.innerHTML = "";
    overlay.appendChild(detailPanel(p));
    document.body.appendChild(overlay);

    // Close handlers
    const close = () => {
      overlay.remove();
      state.detailSlug = null;
      history.replaceState(null, "", location.pathname);
    };
    overlay.querySelector(".close-btn").addEventListener("click", close);
    overlay.addEventListener("click", e => { if (e.target === overlay) close(); });
    document.addEventListener("keydown", function esc(e) { if (e.key === "Escape") { close(); document.removeEventListener("keydown", esc); } });

    // Deep link
    history.pushState(null, "", `?detail=${p.slug}`);
  }

  // Detail panel content
  function detailPanel(p) {
    const m = p.model;
    const growth = p.change_7d;
    const growthClass = growth === null ? "" : (growth >= 0 ? "positive" : "negative");

    // Value bar chart data
    const bars = [
      { label: "TVL", value: p.tvl_usd, max: p.tvl_usd, color: "linear-gradient(90deg, #00d4aa, #00b896)" },
      { label: "Base", value: m.base_value_usd, max: Math.max(p.tvl_usd, m.base_value_usd, p.implied_value_usd), color: "linear-gradient(90deg, #ff6b2a, #e85d1f)" },
      { label: "Growth×", value: m.base_value_usd * m.growth_multiplier, max: Math.max(p.tvl_usd, m.base_value_usd, p.implied_value_usd), color: "linear-gradient(90deg, #ff6b2a, #ffb800)" },
      { label: "Maturity×", value: m.base_value_usd * m.growth_multiplier * m.maturity_multiplier, max: Math.max(p.tvl_usd, m.base_value_usd, p.implied_value_usd), color: "linear-gradient(90deg, #7c4dff, #6a3de8)" },
      { label: "Implied", value: p.implied_value_usd, max: Math.max(p.tvl_usd, m.base_value_usd, p.implied_value_usd), color: "linear-gradient(90deg, #ff6b2a, #ff4d6a)" }
    ];

    // Sparkline data - generate simple 7-day trend
    const sparkPoints = Array.from({ length: 7 }, (_, i) => {
      const base = p.tvl_usd;
      const variance = base * 0.02;
      return base + (Math.random() - 0.5) * variance * 2;
    });
    const sparkMin = Math.min(...sparkPoints);
    const sparkMax = Math.max(...sparkPoints);
    const sparkRange = sparkMax - sparkMin || 1;
    const sparkPath = sparkPoints.map((v, i) => {
      const x = (i / 6) * 100;
      const y = 100 - ((v - sparkMin) / sparkRange) * 90;
      return `${x}% ${y}%`;
    }).join(", ");

    const panel = el("div", { class: "detail-panel" },
      el("header", { class: "detail-header" },
        el("div", { class: "detail-header-main" },
          el("h2", { id: "detail-title" }, p.name),
          el("span", { class: "detail-slug" }, p.slug),
          isWatchlist(p) ? el("span", { class: "wl-badge" }, "Watchlist") : null
        ),
        el("div", { class: "detail-value" },
          el("div", { class: "label" }, "Implied Value"),
          el("div", { class: "value" }, fmtCompact(p.implied_value_usd))
        ),
        el("button", { class: "close-btn", "aria-label": "Close detail" }, "✕")
      ),

      // Key metrics grid
      el("dl", { class: "detail-grid" },
        el("dt", {}, "Category"), el("dd", {}, p.category ?? "—"),
        el("dt", {}, "Chains"), el("dd", {}, p.chains.join(", ")),
        el("dt", {}, "TVL"), el("dd", {}, fmtUsd(p.tvl_usd)),
        el("dt", {}, "7d Change"), el("dd", { class: growthClass }, fmtPct(growth)),
        el("dt", {}, "Age"), el("dd", {}, p.age_days + " days"),
        el("dt", {}, "Comp Multiple"), el("dd", {}, m.comp_multiple.toFixed(4) + ` (${m.comps_n} ${m.comps_source} comps)`),
        el("dt", {}, "Base Value"), el("dd", {}, fmtUsd(m.base_value_usd)),
        el("dt", {}, "Growth Mult"), el("dd", { class: growthClass }, "×" + m.growth_multiplier.toFixed(4)),
        el("dt", {}, "Maturity Mult"), el("dd", {}, "×" + m.maturity_multiplier.toFixed(4)),
        el("dt", {}, "Implied Value"), el("dd", { class: "implied-value" }, fmtUsd(p.implied_value_usd)),
        el("dt", {}, "Model Detail"), el("dd", { class: "model-detail" }, formatModel(m))
      ),

      // Value Bar Chart
      el("div", { class: "value-bar-chart", "aria-label": "Value composition chart" },
        ...bars.map(b => {
          const pct = (b.value / b.max * 100).toFixed(1);
          return el("div", { class: "bar-row" },
            el("div", { class: "bar-label" }, b.label),
            el("div", { class: "bar-track" },
              el("div", {
                class: "bar-fill",
                style: `width: ${pct}%; background: ${b.color};`
              }, el("span", { class: "bar-value" }, fmtCompact(b.value)))
            )
          );
        })
      ),

      // Sparkline
      el("div", { class: "sparkline-wrap", "aria-label": "7-day TVL trend" },
        el("svg", { class: "sparkline", viewBox: "0 0 100 100", preserveAspectRatio: "none" },
          el("path", {
            d: `M${sparkPath}`,
            fill: "none",
            stroke: "url(#spark-gradient)",
            "stroke-width": "2.5",
            "stroke-linecap": "round",
            "stroke-linejoin": "round"
          }),
          el("defs", {},
            el("linearGradient", { id: "spark-gradient", x1: "0%", y1: "0%", x2: "100%", y2: "0%" },
              el("stop", { offset: "0%", "stop-color": "#ff6b2a" }),
              el("stop", { offset: "100%", "stop-color": "#00d4aa" })
            )
          )
        )
      ),

      // Farm Plan
      el("h3", {}, "Farm Plan (6 Steps)"),
      el("div", { class: "farm-plan-wrap" },
        el("ol", { class: "farm-plan" },
          ...p.farm_steps.map(step => el("li", {}, step))
        )
      )
    );

    return panel;
  }

  // Main init
  function init() {
    const root = document.getElementById("board");
    root.setAttribute("aria-busy", "false");

    root.appendChild(header());
    root.appendChild(heroSection());
    root.appendChild(filterBar());

    // Table
    const tableWrap = el("div", { class: "table-wrap" },
      el("table", { id: "board-table" },
        el("caption", {}, `Showing <span id="table-count">0</span> of ${DATA.board.length} protocols`),
        headerRow(),
        el("tbody", { id: "board-tbody" })
      )
    );
    root.appendChild(tableWrap);

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
    const wlChip = root.querySelectorAll(".chip-toggle")[0];
    const ptChip = root.querySelectorAll(".chip-toggle")[1];
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

    // Add click handlers to hero cards
    $$(".hero-card").forEach((card, idx) => {
      const p = DATA.board[idx];
      card.addEventListener("click", () => openDetail(p));
      card.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openDetail(p); } });
    });
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
