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
    children.forEach(c => e.append(c instanceof Node ? c : document.createTextNode(c)));
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
      el("p", { class: "subtitle" }, `Model ${DATA.model_version} · ${DATA.board.length} protocols ranked by implied launch value · data: ${DATA.source} · floor $${(DATA.floor_usd / 1e6).toFixed(0)}M`)
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
    const tr = el("tr", { "data-slug": p.slug });
    const wl = isWatchlist(p) ? "★" : "";
    const status = isPreToken(p) ? "pre-token" : "token trades";
    const statusClass = isPreToken(p) ? "pre-token" : "token-trades";
    const categoryClass = "cat-" + (p.category ?? "uncategorized").toLowerCase().replace(/[^a-z0-9]+/g, "-");

    tr.innerHTML = `
      <td class="rank">${p.rank}</td>
      <td class="name">${el("a", { href: `?detail=${p.slug}` }, p.name).outerHTML} <span class="slug">${p.slug}</span> ${wl ? '<span class="wl-badge" title="watchlist">★</span>' : ""}</td>
      <td class="category ${categoryClass}"><span class="cat-chip">${p.category ?? "—"}</span></td>
      <td class="chains">${p.chains.join(", ")}</td>
      <td class="tvl">${fmtUsd(p.tvl_usd)}</td>
      <td class="growth ${p.change_7d !== null && p.change_7d >= 0 ? "positive" : p.change_7d !== null ? "negative" : ""}">${fmtPct(p.change_7d)}</td>
      <td class="value">${fmtUsd(p.implied_value_usd)}</td>
      <td class="age">${p.age_days} days</td>
      <td class="status ${statusClass}">${status}</td>
    `;
    tr.addEventListener("click", e => {
      if (e.target.tagName !== "A") openDetail(p);
    });
    return tr;
  }

  // Sort and render table
  function renderTable() {
    const tbody = $("#board-table tbody");
    const filtered = DATA.board.filter(matches);

    // Sort
    filtered.sort((a, b) => {
      let av = a[state.sortKey];
      let bv = b[state.sortKey];
      if (av === null) av = -Infinity;
      if (bv === null) bv = -Infinity;
      const dir = state.sortDir === "asc" ? 1 : -1;
      if (typeof av === "string") return av.localeCompare(bv) * dir;
      return (av - bv) * dir;
    });

    tbody.innerHTML = "";
    filtered.forEach(p => tbody.appendChild(rowEl(p)));

    // Update sort arrows
    $$("#board-table th[data-sort]").forEach(th => {
      th.textContent = th.dataset.label + " " + getSortArrow(th.dataset.sort);
    });

    // Update row count
    const countEl = $("#row-count");
    if (countEl) countEl.textContent = `${filtered.length} / ${DATA.board.length} protocols`;

    // Update methodology footnote reference
    const methEl = $("#model-footnote");
    if (methEl) methEl.textContent = `Value model: buildRadar() in lib/model.ts — TVL × comp multiple × growth multiplier × maturity multiplier → implied value`;
  }

  // Build methodology section
  function methodology() {
    return el("section", { class: "methodology" },
      el("h2", {}, "How Implied Value Is Computed"),
      el("p", { id: "model-footnote" }, `Value model: buildRadar() in lib/model.ts — TVL × comp multiple × growth multiplier × maturity multiplier → implied value`),
      el("ol", {},
        el("li", {}, el("strong", {}, "TVL × comp multiple"), " → base value. Comps are median mcap/TVL from live-token protocols in the same category (min 5); fallback to market-wide median."),
        el("li", {}, el("strong", {}, "Growth multiplier"), " → 1 + (clamped 7d change / 100) × 0.5. 7d change clamped to [-60%, +120%]."),
        el("li", {}, el("strong", {}, "Maturity multiplier"), " → linear from 0.7 at day 0 to 1.0 at 1095 days (3 years)."),
        el("li", {}, el("strong", {}, "Floor"), " → $1 minimum.")
      )
    );
  }

  // Create horizontal bar chart for value math
  function valueBarChart(p) {
    const m = p.model;
    const steps = [
      { label: "TVL", value: p.tvl_usd, color: "#3b82f6" },
      { label: "× Comp", value: m.base_value_usd, color: "#06b6d4" },
      { label: "× Growth", value: Math.round(m.base_value_usd * m.growth_multiplier), color: "#00d4aa" },
      { label: "× Maturity", value: p.implied_value_usd, color: "#00d4aa" }
    ];
    const maxVal = Math.max(...steps.map(s => s.value));
    const container = el("div", { class: "value-bar-chart" });
    steps.forEach((step, i) => {
      const pct = (step.value / maxVal * 100).toFixed(1);
      const bar = el("div", { class: "bar-row" },
        el("span", { class: "bar-label" }, step.label),
        el("div", { class: "bar-track" },
          el("div", { class: "bar-fill", style: `width:${pct}%; background:${step.color}` },
            el("span", { class: "bar-value" }, fmtUsd(step.value))
          )
        )
      );
      container.appendChild(bar);
    });
    return container;
  }

  // Create sparkline for 7d TVL history (simulated from snapshot if available)
  function sparkline(p) {
    // The snapshot doesn't have daily TVL history, but we can create a small deterministic
    // sparkline using the 7d change % as a guide - showing current vs 7d ago
    const change = p.change_7d;
    const canvas = document.createElement("canvas");
    canvas.width = 120;
    canvas.height = 40;
    canvas.className = "sparkline";
    const ctx = canvas.getContext("2d");
    if (!ctx) return canvas;

    // Generate deterministic pseudo-history based on protocol slug
    let hash = 0;
    for (let i = 0; i < p.slug.length; i++) {
      hash = ((hash << 5) - hash) + p.slug.charCodeAt(i);
      hash |= 0;
    }
    const rng = () => {
      hash = (hash * 1664525 + 1013904223) >>> 0;
      return hash / 4294967296;
    };

    // Create 8 points from 7d ago to now
    const points = [];
    const now = p.tvl_usd;
    const weekAgo = change !== null ? now / (1 + change / 100) : now;
    for (let i = 0; i < 8; i++) {
      const t = i / 7;
      const base = weekAgo + (now - weekAgo) * t;
      // Add deterministic noise
      const noise = (rng() - 0.5) * 0.02 * now;
      points.push(base + noise);
    }

    const minVal = Math.min(...points);
    const maxVal = Math.max(...points);
    const range = maxVal - minVal || 1;

    ctx.strokeStyle = change !== null && change >= 0 ? "#00d4aa" : "#ff4d6a";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    points.forEach((v, i) => {
      const x = (i / (points.length - 1)) * 120;
      const y = 40 - ((v - minVal) / range) * 34;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Add current value label
    ctx.font = "10px ui-monospace, monospace";
    ctx.fillStyle = "#9aa3ad";
    ctx.textAlign = "right";
    ctx.fillText(fmtUsd(now), 118, 38);

    return canvas;
  }

  // Build protocol detail view
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
            el("h2", {}, p.name, " ", wl),
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
    const table = el("table", { id: "board-table" },
      el("caption", {},
        el("span", { id: "row-count" }, "")
      ),
      el("thead", {},
        el("tr", {},
          el("th", { scope: "col", "data-sort": "rank", "data-label": "Rank" }, "Rank ⇅"),
          el("th", { scope: "col", "data-sort": "name", "data-label": "Protocol" }, "Protocol ⇅"),
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
    root.appendChild(el("footer", {}, `PreToken Radar · model ${DATA.model_version} · data: ${DATA.source} · floor $${(DATA.floor_usd / 1e6).toFixed(0)}M · no network, no framework`));

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

  // Run init when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
