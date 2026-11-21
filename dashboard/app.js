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
    detailSlug: null
  };

  // Helpers
  const $ = (sel: string, root: Element = document) => root.querySelector(sel);
  const $$ = (sel: string, root: Element = document) => Array.from(root.querySelectorAll(sel));
  const el = (tag: string, attrs: Record<string, string> = {}, ...children: (Node | string)[]) => {
    const e = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
    children.forEach(c => e.append(c instanceof Node ? c : document.createTextNode(c)));
    return e;
  };
  const fmt = (n: number) => n.toLocaleString();
  const fmtUsd = (n: number) => "$" + fmt(n);
  const fmtPct = (n: number | null) => n === null ? "—" : (n >= 0 ? "+" : "") + n.toFixed(2) + "%";

  // Extract unique categories and chains from DATA
  const categories = ["all", ...Array.from(new Set(DATA.board.map(r => r.category ?? "Uncategorized").filter(Boolean))).sort()];
  const chains = ["all", ...Array.from(new Set(DATA.board.flatMap(r => r.chains))).sort()];

  // Watchlist set
  const watchlistSet = new Set(DATA.radar?.watchlist ?? []);

  // Chain for a protocol (first chain)
  function chainOf(p: typeof DATA.board[0]): string {
    return p.chains[0] ?? "Ethereum";
  }

  // Determine if protocol is on watchlist
  function isWatchlist(p: typeof DATA.board[0]): boolean {
    return watchlistSet.has(p.slug);
  }

  // Build header
  function header(): HTMLElement {
    return el("header", { class: "header" },
      el("h1", {}, "PreToken Radar"),
      el("p", { class: "subtitle" }, `Model ${DATA.model_version} · ${DATA.board.length} protocols ranked by implied launch value · data: ${DATA.source} · floor $${(DATA.floor_usd / 1e6).toFixed(0)}M`)
    );
  }

  // Build filter bar
  function filterBar(): HTMLElement {
    const bar = el("div", { class: "filterbar" },
      el("label", {}, "Search ", el("input", { type: "search", placeholder: "slug, name, category…", "aria-label": "Search" })),
      el("label", {}, "Category ", el("select", { "aria-label": "Category" }, ...categories.map(c => el("option", { value: c }, c)))),
      el("label", {}, "Chain ", el("select", { "aria-label": "Chain" }, ...chains.map(c => el("option", { value: c }, c)))),
      el("label", { class: "chip" }, el("input", { type: "checkbox" }), " Watchlist only")
    );

    // Wire up filter events
    const [search, catSel, chainSel, chip] = [bar.querySelector("input[type=search]")!, bar.querySelectorAll("select")[0], bar.querySelectorAll("select")[1], bar.querySelector(".chip")!];
    const checkbox = chip.querySelector("input[type=checkbox]")!;

    search.addEventListener("input", e => { state.q = (e.target as HTMLInputElement).value; renderTable(); });
    catSel.addEventListener("change", e => { state.category = (e.target as HTMLSelectElement).value; renderTable(); });
    chainSel.addEventListener("change", e => { state.chain = (e.target as HTMLSelectElement).value; renderTable(); });
    checkbox.addEventListener("change", e => { state.wlOnly = (e.target as HTMLInputElement).checked; chip.classList.toggle("on", state.wlOnly); renderTable(); });

    return bar;
  }

  // Check if a row matches current filters
  function matches(p: typeof DATA.board[0]): boolean {
    if (state.wlOnly && !isWatchlist(p)) return false;
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
  function formatModel(m: typeof DATA.board[0]["model"]): string {
    return `comp multiple: ${m.comp_multiple.toFixed(4)} (${m.comps_n} ${m.comps_source} comps) · base: ${fmtUsd(m.base_value_usd)} · growth: ${fmtPct(m.growth_pct)} (×${m.growth_multiplier.toFixed(4)}) · maturity: ×${m.maturity_multiplier.toFixed(4)} (age ${m.age_days}d)`;
  }

  // Render a table row
  function rowEl(p: typeof DATA.board[0]): HTMLElement {
    const tr = el("tr", { "data-slug": p.slug });
    const wl = isWatchlist(p) ? "★" : "";
    tr.innerHTML = `
      <td class="rank">${p.rank}</td>
      <td class="name">${el("a", { href: `?detail=${p.slug}` }, p.name).outerHTML} <span class="slug">${p.slug}</span> ${wl ? '<span class="wl-badge" title="watchlist">★</span>' : ""}</td>
      <td class="category">${p.category ?? "—"}</td>
      <td class="chains">${p.chains.join(", ")}</td>
      <td class="tvl">${fmtUsd(p.tvl_usd)}</td>
      <td class="growth">${fmtPct(p.change_7d)}</td>
      <td class="value">${fmtUsd(p.implied_value_usd)}</td>
      <td class="age">${p.age_days}d</td>
    `;
    tr.addEventListener("click", e => {
      if ((e.target as HTMLElement).tagName !== "A") openDetail(p);
    });
    return tr;
  }

  // Render the board table
  function renderTable(): void {
    const tbody = $("#board tbody")!;
    tbody.innerHTML = "";
    const filtered = DATA.board.filter(matches);
    for (const p of filtered) tbody.appendChild(rowEl(p));
    $("#board caption")!.textContent = `${filtered.length} / ${DATA.board.length} protocols`;
  }

  // Build methodology section
  function methodology(): HTMLElement {
    return el("section", { class: "methodology", id: "methodology" },
      el("h2", {}, "Methodology"),
      el("p", {}, "The radar calibrates an implied launch value from the snapshot's own live-token protocols — no external prices, no API keys."),
      el("ol", {},
        el("li", {}, el("strong", {}, "Comparables: "), "For each category with ≥5 live-token protocols, take the median mcap/TVL ratio. Categories with too few fall back to the whole-market median, shrunk toward a base multiple of 0.6×."),
        el("li", {}, el("strong", {}, "Base value: "), "TVL × category multiple — the starting implied value if the protocol launched today at its category's going multiple."),
        el("li", {}, el("strong", {}, "Growth multiplier: "), "7-day TVL change clamped to [−60%, +120%] and applied with 0.5 weight: growthMult = 1 + (clamped_pct/100) × 0.5."),
        el("li", {}, el("strong", {}, "Maturity multiplier: "), "Age (days since listed_at, or 365 if unknown) maps linearly from 0.7× at day 0 to 1.0× at 1095 days (3 years): maturityMult = 0.7 + min(age,1095)/1095 × 0.3. Older pre-token protocols get a lower multiple."),
        el("li", {}, el("strong", {}, "Implied value: "), "round(base × growthMult × maturityMult), floored at $1.")
      ),
      el("p", {}, `Constants: BASE_MULTIPLE=0.6, CATEGORY_MIN_COMPS=5, GROWTH_CLAMP=[-60,120], GROWTH_WEIGHT=0.5, MATURITY_RANGE=[0.7,1.0] over 1095d, FLOOR_VALUE=1, TARGET_ROWS=200, WATCHLIST_SIZE=40.`)
    );
  }

  // Build protocol detail view
  function detailEl(p: typeof DATA.board[0]): HTMLElement {
    const closeBtn = el("button", { class: "close-btn", "aria-label": "Close detail" }, "✕");
    closeBtn.addEventListener("click", closeDetail);

    const model = p.model;
    const chains = p.chains.join(", ");
    const wl = isWatchlist(p) ? el("span", { class: "wl-badge" }, "Watchlist") : null;

    const farmSteps = p.farm_steps.map((step, i) => el("li", {}, el("strong", {}, `Step ${i + 1}: `), step));

    return el("div", { class: "detail-overlay" },
      el("div", { class: "detail-panel" },
        el("div", { class: "detail-header" },
          el("h2", {}, p.name, " ", wl),
          el("span", { class: "detail-slug" }, p.slug),
          closeBtn
        ),
        el("dl", { class: "detail-grid" },
          el("dt", {}, "Category"), el("dd", {}, p.category ?? "—"),
          el("dt", {}, "Chains"), el("dd", {}, chains),
          el("dt", {}, "TVL"), el("dd", {}, fmtUsd(p.tvl_usd)),
          el("dt", {}, "7d change"), el("dd", {}, fmtPct(p.change_7d)),
          el("dt", {}, "Age"), el("dd", {}, `${p.age_days} days`),
          el("dt", {}, "Implied value"), el("dd", { class: "implied-value" }, fmtUsd(p.implied_value_usd)),
          el("dt", {}, "Model"), el("dd", { class: "model-detail" }, formatModel(model))
        ),
        el("h3", {}, "Farm Plan"),
        el("ol", { class: "farm-plan" }, ...farmSteps)
      )
    );
  }

  // Open detail view
  function openDetail(p: typeof DATA.board[0]): void {
    state.detailSlug = p.slug;
    const overlay = detailEl(p);
    document.body.appendChild(overlay);
    // Update URL without reload
    const url = new URL(location.href);
    url.searchParams.set("detail", p.slug);
    history.pushState(null, "", url);
    // Focus trap
    const closeBtn = overlay.querySelector(".close-btn")!;
    closeBtn.focus();
  }

  // Close detail view
  function closeDetail(): void {
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
  function init(): void {
    const root = document.getElementById("board")!;
    root.setAttribute("aria-busy", "false");
    root.appendChild(header());
    root.appendChild(filterBar());

    // Build table structure
    const table = el("table", { id: "board-table" },
      el("caption", {}, ""),
      el("thead", {},
        el("tr", {},
          el("th", { scope: "col" }, "Rank"),
          el("th", { scope: "col" }, "Protocol"),
          el("th", { scope: "col" }, "Category"),
          el("th", { scope: "col" }, "Chains"),
          el("th", { scope: "col" }, "TVL"),
          el("th", { scope: "col" }, "7d"),
          el("th", { scope: "col" }, "Implied Value"),
          el("th", { scope: "col" }, "Age")
        )
      ),
      el("tbody", {})
    );
    root.appendChild(table);
    renderTable();
    root.appendChild(methodology());
    root.appendChild(el("footer", {}, `PreToken Radar · model ${DATA.model_version} · data: ${DATA.source} · floor $${(DATA.floor_usd / 1e6).toFixed(0)}M · no network, no framework`));

    // Deep link handling
    const params = new URLSearchParams(location.search);
    if (params.get("q")) state.q = params.get("q")!;
    if (params.get("cat") && categories.includes(params.get("cat")!)) state.category = params.get("cat")!;
    if (params.get("chain") && chains.includes(params.get("chain")!)) state.chain = params.get("chain")!;
    if (params.get("wl") === "1") state.wlOnly = true;

    // Reflect deep-linked state in controls
    const search = root.querySelector("input[type=search]")!;
    const catSel = root.querySelectorAll("select")[0];
    const chainSel = root.querySelectorAll("select")[1];
    const chip = root.querySelector(".chip")!;
    const checkbox = chip.querySelector("input[type=checkbox]")!;

    if (state.q) search.value = state.q;
    if (state.category !== "all") catSel.value = state.category;
    if (state.chain !== "all") chainSel.value = state.chain;
    if (state.wlOnly) { checkbox.checked = true; chip.classList.add("on"); }

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
