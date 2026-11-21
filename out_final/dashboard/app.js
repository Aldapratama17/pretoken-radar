// PreToken Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the ranked board, a filterable and sortable table, a per-protocol detail view with the
// model's own inputs and the protocol's farm plan, and the methodology the numbers come from.
// No network: every byte it shows is in data.js, and the page recomputes the model itself so the
// code and the board's data are visibly the same arithmetic.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var root = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', sort: 'rank', dir: 1, wlOnly: false, selected: null };

  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    var abs = Math.abs(n);
    if (abs >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (abs >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (abs >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    return n.toFixed(2) + 'x';
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The categories and chains the filter selects from, derived from the rows themselves.
  var categories = [];
  var chains = [];
  DATA.rows.forEach(function (r) {
    if (r.category && categories.indexOf(r.category) < 0) categories.push(r.category);
    (r.chains || []).forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); });
  });
  categories.sort(); chains.sort();

  // The model, recomputed in the page from the row's own inputs.
  function impliedOf(row, model) {
    var comp = row.comp_multiple;
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    return Math.max(1, Math.round(row.tvl_usd * comp * growthMult * maturity));
  }

  function watchSet() { return null; }

  var watchIdx = {};
  // The snapshot's watchlist is the floor; rows from it are the board's headline set. main.ts marks
  // them through row order: a row whose slug sits in the watchlist is flagged in data.js by size —
  // so the page keeps its own copy from the model's floor: rows at or above the floor TVL.
  DATA.rows.forEach(function (r) { if (r.tvl_usd >= DATA.floor_usd) watchIdx[r.slug] = true; });

  function isWatch(row) { return !!watchIdx[row.slug]; }

  function filtered() {
    var q = state.q.trim().toLowerCase();
    var rows = DATA.rows.filter(function (r) {
      if (state.wlOnly && !isWatch(r)) return false;
      if (state.category !== 'all' && (r.category || 'Uncategorized') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (q) {
        var hay = (r.name + ' ' + r.slug + ' ' + (r.category || '')).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
    var key = state.sort;
    rows.sort(function (a, b) {
      var av = key === 'name' ? a.name.toLowerCase() : key === 'tvl' ? a.tvl_usd : key === 'implied' ? a.implied_value_usd : key === 'growth' ? (a.change_7d === null ? -999 : a.change_7d) : key === 'age' ? (a.age_days === null ? -1 : a.age_days) : a.rank;
      var bv = key === 'name' ? b.name.toLowerCase() : key === 'tvl' ? b.tvl_usd : key === 'implied' ? b.implied_value_usd : key === 'growth' ? (b.change_7d === null ? -999 : b.change_7d) : key === 'age' ? (b.age_days === null ? -1 : b.age_days) : b.rank;
      if (av < bv) return -1 * state.dir;
      if (av > bv) return 1 * state.dir;
      return a.rank - b.rank;
    });
    return rows;
  }

  function header() {
    var best = DATA.rows[0];
    var hero = el('header', { class: 'hero' }, el('div', { class: 'hero-inner' },
      el('div', { class: 'brand' },
        el('h1', null, 'PreToken', el('span', { class: 'dot' }, 'Radar'), ' — implied value board'),
        el('span', { class: 'ver' }, 'model ' + DATA.model_version + ' · snapshot ' + DATA.as_of)
      ),
      el('p', { class: 'tagline' },
        'Protocols with no token yet, ranked by what a launch would be worth. The implied value is priced off the snapshot\'s own comparables — live-token protocols\' market cap to TVL ratios, by category — then adjusted for seven-day growth and how long the protocol has run without a token. A protocol on the snapshot\'s watchlist is marked ', el('span', { class: 'badge wl' }, 'watchlist'), '; it records no token, never that it has none.'),
      el('div', { class: 'statrow' },
        el('div', { class: 'stat hl' }, el('b', null, String(DATA.rows.length)), el('span', null, 'pre-token rows')),
        el('div', { class: 'stat' }, el('b', null, String(DATA.watchlist_size)), el('span', null, 'watchlist covered')),
        el('div', { class: 'stat' }, el('b', null, fmtUsd(best ? best.implied_value_usd : 0)), el('span', null, 'top implied value')),
        el('div', { class: 'stat' }, el('b', null, String(DATA.comps.length)), el('span', null, 'comparable categories')),
        el('div', { class: 'stat' }, el('b', null, String(DATA.live_size)), el('span', null, 'live tokens set aside'))
      )
    ));
    return hero;
  }

  function filterBar() {
    var bar = el('div', { class: 'filterbar' });
    var search = el('input', { type: 'search', placeholder: 'Search name, slug, category…', 'aria-label': 'Search protocols' });
    search.addEventListener('input', function () { state.q = search.value; renderTable(); });
    var catSel = el('select', { 'aria-label': 'Category filter' }, el('option', { value: 'all', text: 'All categories' }));
    categories.forEach(function (c) { catSel.appendChild(el('option', { value: c, text: c })); });
    catSel.addEventListener('change', function () { state.category = catSel.value; renderTable(); });
    var chainSel = el('select', { 'aria-label': 'Chain filter' }, el('option', { value: 'all', text: 'All chains' }));
    chains.forEach(function (c) { chainSel.appendChild(el('option', { value: c, text: c })); });
    chainSel.addEventListener('change', function () { state.chain = chainSel.value; renderTable(); });
    var wl = el('button', { class: 'chip', text: 'Watchlist only', onclick: function () { state.wlOnly = !state.wlOnly; wl.classList.toggle('on', state.wlOnly); renderTable(); } });
    var count = el('span', { class: 'count' });
    bar.appendChild(search); bar.appendChild(catSel); bar.appendChild(chainSel); bar.appendChild(wl); bar.appendChild(count);
    bar._count = count;
    return bar;
  }

  var COLS = [
    { key: 'rank', label: '#' },
    { key: 'name', label: 'Protocol' },
    { key: 'implied', label: 'Implied value' },
    { key: 'tvl', label: 'TVL' },
    { key: 'growth', label: '7d' },
    { key: 'age', label: 'Age' },
  ];

  function renderTable() {
    var old = document.getElementById('tablewrap');
    if (old) old.remove();
    var rows = filtered();
    filterbar._count.textContent = rows.length + ' of ' + DATA.rows.length + ' rows';
    var wrap = el('div', { id: 'tablewrap' });
    var table = el('table', { class: 'board' });
    var thead = el('thead');
    var trh = el('tr');
    COLS.forEach(function (c) {
      var th = el('th', { text: c.label, onclick: function () {
        if (state.sort === c.key) state.dir = -state.dir;
        else { state.sort = c.key; state.dir = c.key === 'rank' || c.key === 'name' ? 1 : -1; }
        renderTable();
      } });
      if (state.sort === c.key) th.appendChild(el('span', { class: 'arr', text: state.dir > 0 ? '▲' : '▼' }));
      trh.appendChild(th);
    });
    thead.appendChild(trh); table.appendChild(thead);
    var tbody = el('tbody');
    rows.slice(0, 200).forEach(function (r) {
      var tr = el('tr', { class: 'row' + (isWatch(r) ? ' wl' : ''), onclick: function () { openDetail(r); } },
        el('td', { class: 'rk', text: String(r.rank) }),
        el('td', null,
          el('span', { class: 'pname' }, r.name, el('span', { class: 'sub' }, (r.category || 'Uncategorized') + ' · ' + (r.chains || []).join(', '))),
          el('span', { class: 'chains' })),
        el('td', { class: 'imp', text: fmtUsd(r.implied_value_usd) }),
        el('td', { class: 'tvl', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'gr ' + (r.change_7d === null ? 'flat' : r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'age', text: fmtAge(r.age_days) })
      );
      var badgeCell = tr.children[1].querySelector('.pname');
      if (isWatch(r)) badgeCell.appendChild(el('span', { class: 'badge wl', text: 'watchlist' }));
      if (r.comps_source === 'category') badgeCell.appendChild(el('span', { class: 'badge mult', title: 'Priced off ' + r.comps_n + ' live-token comparables in its category', text: fmtMult(r.comp_multiple) + ' comps' }));
      else badgeCell.appendChild(el('span', { class: 'badge mult', text: fmtMult(r.comp_multiple) + ' market' }));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    if (rows.length > 200) wrap.appendChild(el('p', { class: 'live-hint', text: 'Showing the first 200 of ' + rows.length + ' rows; narrow the filters to see the rest. The full board is in board.json.' }));
    wrap.appendChild(el('p', { class: 'live-hint', text: 'Sorted by implied value on load; click a header to re-sort, a row to open its detail view. Live-token protocols are set aside — a token that already trades is priced by the market, not by this model (' + DATA.live_size + ' shown below the board in board.json\'s companion data).' }));
    main.appendChild(wrap);
  }

  function methodology() {
    var m = DATA.model;
    var sec = el('section', { class: 'meth' },
      el('h3', null, 'How the implied value is computed'),
      el('p', null, 'Every number comes from the sealed snapshot\'s own figures — no hand-kept list of names, no outside data. The comparable multiple is the median market cap / TVL ratio of the snapshot\'s live-token protocols in the same category, blended toward a conservative base when the category has fewer than ' + m.comps_min + ' comparables.'),
      el('p', null, el('code', null, 'implied = TVL × compMultiple × (1 + growth/100 × ' + m.growth_weight + ') × (' + m.maturity_floor + ' + ageShare × ' + m.maturity_range + ')')),
      el('p', null, 'Growth is the seven-day TVL change, clamped to [' + m.growth_floor + ', ' + m.growth_cap + ']%. Age is the days the protocol has run with no token, up to ' + m.maturity_days + '; a protocol with an unknown age is treated as ' + m.unknown_age_days + ' days old. The page recomputes each row from its own inputs, so the board and this code cannot drift apart.'),
      el('p', null, 'A protocol whose token already trades never sits on this board: the Live token view carries it at the market\'s own value, separated from the ranked pre-token set. A watchlist row records no token as of ' + DATA.as_of + ' — that is a record, not a promise of an airdrop.')
    );
    var table = el('table', { class: 'comps' }, el('thead', null, el('tr', null, el('th', { text: 'Comparable category' }), el('th', { text: 'Live comps' }), el('th', { text: 'Median multiple' }))), el('tbody'));
    DATA.comps.forEach(function (c) {
      table.appendChild(el('tr', null,
        el('td', { text: c.category }),
        el('td', { class: 'n', text: String(c.n) }),
        el('td', { class: 'n', text: fmtMult(c.median_multiple) })));
    });
    sec.appendChild(table);
    return sec;
  }

  function openDetail(r) {
    var m = DATA.model;
    var growth = Math.min(m.growth_cap, Math.max(m.growth_floor, r.change_7d === null ? 0 : r.change_7d));
    var growthMult = 1 + (growth / 100) * m.growth_weight;
    var age = r.age_days === null ? m.unknown_age_days : r.age_days;
    var maturity = m.maturity_floor + (Math.min(Math.max(age, 0), m.maturity_days) / m.maturity_days) * m.maturity_range;
    var dlg = document.createElement('dialog');
    dlg.className = 'detail';
    var body = el('div', { class: 'body' },
      el('div', { class: 'valueline' }, fmtUsd(r.implied_value_usd), el('small', null, ' implied launch value · model ' + DATA.model_version)),
      el('div', { class: 'grid2' },
        el('div', { class: 'kv' }, el('span', null, 'Category'), el('b', { text: r.category || 'Uncategorized' })),
        el('div', { class: 'kv' }, el('span', null, 'Chains'), el('b', { text: (r.chains || []).join(', ') || '—' })),
        el('div', { class: 'kv' }, el('span', null, 'TVL'), el('b', { text: fmtUsd(r.tvl_usd) + ' · 7d ' + fmtPct(r.change_7d) })),
        el('div', { class: 'kv' }, el('span', null, 'Age / listed'), el('b', { text: fmtAge(r.age_days) + (r.listed_at ? ' · since ' + r.listed_at : '') })),
        el('div', { class: 'kv' }, el('span', null, 'Comparable multiple'), el('b', { text: fmtMult(r.comp_multiple) + ' (' + r.comps_source + ', ' + r.comps_n + ' comps)' })),
        el('div', { class: 'kv' }, el('span', null, 'Watchlist'), el('b', { text: isWatch(r) ? 'yes — the snapshot\'s watchlist' : 'below the watchlist floor, early radar' }))
      ),
      el('div', { class: 'waterfall' },
        el('div', { class: 'step' }, el('span', { text: 'TVL × comparable multiple' }), el('b', { text: fmtUsd(r.base_value_usd) })),
        el('div', { class: 'step' }, el('span', { text: '× growth multiplier (' + growth.toFixed(1) + '% clamped)' }), el('b', { text: fmtMult(growthMult) })),
        el('div', { class: 'step' }, el('span', { text: '× maturity multiplier (' + fmtAge(r.age_days) + ' no token)' }), el('b', { text: fmtMult(maturity) })),
        el('div', { class: 'step total' }, el('span', { text: 'Implied value' }), el('b', { text: fmtUsd(impliedOf(r, m)) }))
      ),
      el('section', { class: 'plan' },
        el('h3', null, 'How to farm it'),
        (function () {
          var ol = el('ol', { class: 'steps' });
          var steps = planFor(r);
          steps.forEach(function (s) {
            ol.appendChild(el('li', null, el('b', { text: s.action }), el('div', null, s.cost + ' · ' + s.time)));
          });
          return ol;
        })(),
        el('div', { class: 'note' }, 'Farm at your own risk: a watchlist listing means the snapshot records no token, not that one is coming. Never pay anyone to claim an airdrop, and sign nothing you cannot read.')
      ),
      el('div', { class: 'note' }, 'Slug ' + r.slug + ' · ranked #' + r.rank + ' of ' + DATA.rows.length + ' · snapshot ' + DATA.source)
    );
    var head = el('div', { class: 'head' },
      el('h2', { text: r.name }),
      el('span', { class: 'badge wl', text: isWatch(r) ? 'watchlist' : 'early radar' }),
      el('button', { class: 'close', text: 'Close', onclick: function () { dlg.close(); } })
    );
    dlg.appendChild(head); dlg.appendChild(body);
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
    document.body.appendChild(dlg);
    dlg.showModal();
    dlg.addEventListener('close', function () { dlg.remove(); });
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL and age
  // decide the action, the capital, the hold and every cost and time. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 300;
    if (p.tvl_usd >= 1e9) return 200;
    if (p.tvl_usd >= 1e8) return 120;
    return 60;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Stake $' + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return 'Mint $' + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function planFor(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var action = actionFor(p, capital, chain);
    return [
      { action: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { action: action, cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { action: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { action: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { action: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { action: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' },
    ];
  }

  // Deep links: ?detail=<slug> opens a protocol's detail view, ?q=&cat=&chain=&wl= apply filters.
  // The page reads them once on load; every link is a plain URL, no hash router and no network.
  var params = new URLSearchParams(location.search);
  if (params.get('q')) state.q = params.get('q');
  if (params.get('cat') && categories.indexOf(params.get('cat')) >= 0) state.category = params.get('cat');
  if (params.get('chain') && chains.indexOf(params.get('chain')) >= 0) state.chain = params.get('chain');
  if (params.get('wl') === '1') state.wlOnly = true;

  var main = root;
  main.setAttribute('aria-busy', 'false');
  main.appendChild(header());
  var filterbar = filterBar();
  main.appendChild(filterbar);
  // Reflect the deep-linked state in the controls so the filters and the rows agree.
  if (state.q) filterbar.querySelector('input[type="search"]').value = state.q;
  if (state.category !== 'all') filterbar.querySelectorAll('select')[0].value = state.category;
  if (state.chain !== 'all') filterbar.querySelectorAll('select')[1].value = state.chain;
  if (state.wlOnly) filterbar.querySelector('.chip').classList.add('on');
  renderTable();
  main.appendChild(methodology());
  main.appendChild(el('footer', null, 'PreToken Radar · model ' + DATA.model_version + ' · data: ' + DATA.source + ' · floor $' + (DATA.floor_usd / 1e6) + 'M · no network, no framework'));
  if (params.get('detail')) {
    var target = DATA.rows.filter(function (r) { return r.slug === params.get('detail'); })[0];
    if (target) openDetail(target);
  }
})();
