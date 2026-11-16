// Token Radar dashboard (radar-2). Reads window.RADAR (written beside dashboard/ by main.ts)
// and renders the ranked board, filters, a per-protocol detail drawer with the model's own
// breakdown and farm plan, and the methodology. No network: every byte shown is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', band: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtMult(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return n.toFixed(2) + 'x';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function finite(n, fallback) { return typeof n === 'number' && isFinite(n) ? n : fallback; }

  // radar-2, in one function. The category multiple comes from the comps table when the data
  // carries it — full precision, which is what the board was scored with (the row only carries
  // the multiple rounded to 4dp, and recomputing from that drifts by thousands of dollars on
  // big TVLs). Else the row's own category_multiple, else the 0.25 base multiple. Growth is
  // clamped to -60..120 and halved in effect; breadth adds 4% per chain past the first, capped
  // at five extra chains; maturity runs 0.6 at listing to 1.0 at 1095 days, and an unknown age
  // counts as 365 days.
  function compOf(row) {
    if (!Array.isArray(DATA.comps)) return null;
    var key = row.category || 'Uncategorized';
    for (var i = 0; i < DATA.comps.length; i++) if (DATA.comps[i].category === key) return DATA.comps[i];
    return null;
  }
  function catMultOf(row) {
    var comp = compOf(row);
    if (comp && finite(comp.multiple, null) !== null) return comp.multiple;
    return finite(row.category_multiple, 0.25);
  }
  function catMultSource(row) {
    if (compOf(row)) return compOf(row).fallback ? 'global median (fewer than 3 tokenized in this category)' : 'category median';
    if (finite(row.category_multiple, null) !== null) return 'row';
    return 'fallback 0.25';
  }
  function recompute(row) {
    var growthPct = Math.min(120, Math.max(-60, finite(row.change_7d, 0)));
    var growthMult = 1 + (growthPct / 100) * 0.5;
    var nChains = (row.chains || []).length;
    var breadthMult = 1 + 0.04 * Math.min(Math.max(nChains - 1, 0), 5);
    var age = row.age_days === null || row.age_days === undefined ? 365 : row.age_days;
    var maturityMult = 0.6 + (Math.min(Math.max(age, 0), 1095) / 1095) * 0.4;
    var implied = Math.max(1, Math.round(row.tvl_usd * catMultOf(row) * growthMult * breadthMult * maturityMult));
    return { catMult: catMultOf(row), growthPct: growthPct, growthMult: growthMult, breadthMult: breadthMult, nChains: nChains, age: age, maturityMult: maturityMult, implied: implied };
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

  // The farm plan is derived from the protocol's own record — category, chains, TVL, age —
  // never from a hand-written list of names. Category picks the action, TVL the capital,
  // age the hold.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
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
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  // Hash state: #q= #category= #chain= #band= #tab= #p=. Read on load and on hashchange so a
  // screenshot or a shared link can target a state; written on every change.
  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    var params = new URLSearchParams(hash);
    state.q = params.get('q') || '';
    state.category = params.get('category') || 'all';
    state.chain = params.get('chain') || 'all';
    state.band = params.get('band') || 'all';
    state.tab = params.get('tab') === 'live' ? 'live' : 'pre-token';
    state.selected = params.get('p') || null;
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.band !== 'all') params.set('band', state.band);
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function bandOk(v) {
    if (state.band === 'gte100m') return v >= 1e8;
    if (state.band === 'm10-100') return v >= 1e7 && v < 1e8;
    if (state.band === 'm1-10') return v >= 1e6 && v < 1e7;
    if (state.band === 'lt1m') return v < 1e6;
    return true;
  }
  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).some(function (c) { return c === state.chain; })) return false;
      if (!bandOk(r.implied_value_usd)) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function liveRows() {
    var q = state.q.trim().toLowerCase();
    return (DATA.live || []).filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).some(function (c) { return c === state.chain; })) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'multiple') { av = catMultOf(a); bv = catMultOf(b); }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }
  function allCategories() {
    var s = {};
    DATA.rows.concat(DATA.live || []).forEach(function (r) { s[r.category || 'Other'] = true; });
    return Object.keys(s).sort();
  }
  function allChains() {
    var s = {};
    DATA.rows.concat(DATA.live || []).forEach(function (r) { (r.chains || []).forEach(function (c) { s[c] = true; }); });
    return Object.keys(s).sort();
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: DATA.model_version + ' model' }),
        el('span', { class: 'src', text: 'Source: ' + DATA.source })
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        el('p', null, 'The watchlist is the floor: every protocol with at least ', el('b', { text: fmtUsd(DATA.floor_usd) }), ' of TVL and no token on record. The early radar adds ', el('b', { text: String(DATA.early_size) }), ' pre-token protocols below that floor. Implied value is a model, not a promise — and not a price.')
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Top implied value' }), el('b', { text: DATA.rows.length ? fmtUsd(DATA.rows[0].implied_value_usd) : 'n/a' }))
      )
    );
  }

  function selectField(id, label, options, current, onChange, disabled) {
    var sel = el('select', { id: id, 'aria-label': label, disabled: disabled ? 'disabled' : null },
      options.map(function (o) { return el('option', { value: o[0], text: o[1], selected: o[0] === current ? 'selected' : null }); })
    );
    sel.addEventListener('change', function () { onChange(sel.value); writeHash(); render(); });
    return el('div', { class: 'field' }, el('label', { for: id, text: label }), sel);
  }

  function controls() {
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, slug, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var catOpts = [['all', 'All categories']].concat(allCategories().map(function (c) { return [c, c]; }));
    var chainOpts = [['all', 'All chains']].concat(allChains().map(function (c) { return [c, c]; }));
    var bandOpts = [['all', 'Any implied value'], ['gte100m', '≥ $100M'], ['m10-100', '$10M – $100M'], ['m1-10', '$1M – $10M'], ['lt1m', '< $1M']];
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; writeHash(); render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; writeHash(); render(); } });
    var shown = state.tab === 'pre-token' ? rows().length : liveRows().length;
    var total = state.tab === 'pre-token' ? DATA.rows.length : (DATA.live || []).length;
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      selectField('category', 'Category', catOpts, state.category, function (v) { state.category = v; }),
      selectField('chain', 'Chain', chainOpts, state.chain, function (v) { state.chain = v; }),
      selectField('band', 'Implied-value band', bandOpts, state.band, function (v) { state.band = v; }, state.tab === 'live'),
      el('div', { class: 'field' }, el('span', { text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count' }, el('b', { text: String(shown) }), ' of ' + total + (state.tab === 'pre-token' ? ' rows shown' : ' live-token protocols shown') + (state.tab === 'live' && state.band !== 'all' ? ' (band applies to pre-token only)' : ''))
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = key === 'name' ? 1 : -1; } render(); } },
        label,
        state.sort === key ? el('span', { class: 'arrow', 'aria-hidden': 'true', text: state.dir < 0 ? ' ▼' : ' ▲' }) : null
      )
    );
  }

  function emptyPanel() {
    return el('div', { class: 'panel' }, el('div', { class: 'empty' },
      el('h2', { text: 'No protocol matches that filter' }),
      el('p', { text: 'Clear the search or pick another category, chain or band to see the board again.' }),
      el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.band = 'all'; writeHash(); render(); } })
    ));
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) return emptyPanel();
    var max = list.reduce(function (m, r) { return Math.max(m, r.implied_value_usd || 0); }, 1);
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' · ' + (r.chains && r.chains.length ? r.chains.slice(0, 3).join(', ') + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: fmtMult(catMultOf(r)) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, el('span', { class: 'status', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Pre-token protocols, strongest implied value first. Select a row for its model breakdown and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('multiple', 'Category multiple'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var list = liveRows();
    if (list.length === 0) return emptyPanel();
    var tbody = el('tbody');
    list.forEach(function (r) {
      var ratio = r.mcap_usd && r.tvl_usd ? r.mcap_usd / r.tvl_usd : null;
      tbody.appendChild(el('tr', { class: 'live-row' },
        el('td', null, el('span', { class: 'status live', text: 'live' })),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' · ' + (r.chains && r.chains.length ? r.chains.slice(0, 3).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: fmtMult(ratio) }),
        el('td', null, el('span', { class: 'status live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. Their mcap / TVL ratios are the raw material for the category multiples. They are set aside from the pre-token ranking.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Mcap / TVL' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model || {};
    var section = el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula', text: 'implied = max(1, round( tvl_usd x category multiple x growth multiplier x breadth multiplier x maturity multiplier ))' }),
      el('ul', null,
        el('li', null, el('b', { text: 'Category multiple. ' }), 'The median market-cap / TVL of the snapshot’s own tokenized protocols in that category. A category with fewer than 3 tokenized protocols uses the global median instead. A row with no category multiple in the data falls back to 0.25.'),
        el('li', null, el('b', { text: 'Growth multiplier. ' }), 'Seven-day change, clamped to −60% … +120%, then halved in effect: 1 + clamped change / 100 × 0.5.'),
        el('li', null, el('b', { text: 'Breadth multiplier. ' }), '1 + 0.04 for each chain past the first, up to five extra chains — at most 1.20× for a protocol on six or more chains.'),
        el('li', null, el('b', { text: 'Maturity multiplier. ' }), '0.6 at listing, rising to 1.0 at 1,095 days (three years). An unknown age counts as 365 days.'),
        el('li', null, el('b', { text: 'Age. ' }), 'Time since the protocol was first listed — the best record of how long it has run with no token. The early radar is every pre-token protocol below the watchlist floor, by TVL; live-token protocols are set aside with their market caps shown.')
      )
    );
    if (Array.isArray(DATA.comps) && DATA.comps.length) {
      var tbody = el('tbody');
      DATA.comps.slice().sort(function (a, b) { return b.multiple - a.multiple; }).forEach(function (c) {
        tbody.appendChild(el('tr', { class: 'live-row' },
          el('td', { text: c.category }),
          el('td', { class: 'num', text: String(c.n) }),
          el('td', { class: 'num', text: fmtMult(c.multiple) }),
          el('td', { class: c.fallback ? 'fallback' : 'num', text: c.fallback ? 'global median' : 'category median' })
        ));
      });
      section.appendChild(el('h3', { text: 'Category multiples in this snapshot' }));
      section.appendChild(el('div', { class: 'table-wrap' }, el('table', { class: 'comps' },
        el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Category' }), el('th', { scope: 'col', text: 'Tokenized (n)' }), el('th', { scope: 'col', text: 'Multiple' }), el('th', { scope: 'col', text: 'Basis' }))),
        tbody
      )));
    } else {
      section.appendChild(el('p', { class: 'sub', text: 'This build’s data file does not carry the per-category table, so no comps table is shown; each row’s own category multiple is still listed in the board’s Category multiple column (0.25 where the data carries none).' }));
    }
    section.appendChild(el('div', { class: 'caveats' },
      el('p', null, el('b', { text: '“No token” means the record shows none. ' }), 'Pre-token means the snapshot records no token for the protocol — no market cap, no token id, no symbol. That is a record, never proof that it has none.'),
      el('p', null, el('b', { text: 'Implied value is the entry’s own model claim, not a price. ' }), 'It says what the protocol would be worth if it traded at its category’s median multiple, after the growth, breadth and maturity adjustments. It is not a token price, not a prediction, and not a promise that a token ever launches.'),
      el('p', null, el('b', { text: 'Snapshot. ' }), 'As of ' + DATA.as_of + '. Source: ' + DATA.source)
    ));
    return section;
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { if (state.selected) { state.selected = null; writeHash(); } });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    var rec = recompute(row);
    var match = rec.implied === row.implied_value_usd;
    var carried = [];
    if (finite(row.growth_multiplier, null) !== null && Math.abs(row.growth_multiplier - rec.growthMult) > 0.0001) carried.push('board carries growth ' + row.growth_multiplier);
    if (finite(row.maturity_multiplier, null) !== null && Math.abs(row.maturity_multiplier - rec.maturityMult) > 0.0001) carried.push('board carries maturity ' + row.maturity_multiplier);
    if (finite(row.breadth_multiplier, null) !== null && Math.abs(row.breadth_multiplier - rec.breadthMult) > 0.0001) carried.push('board carries breadth ' + row.breadth_multiplier);
    var checkText = 'Recomputed in this page as ' + fmtUsd(rec.implied) + (match ? ' — the same number the board carries.' : ' — different from the board’s ' + fmtUsd(row.implied_value_usd) + '.') +
      (match ? '' : (DATA.model_version !== 'radar-2' ? ' The board in this build was scored under ' + DATA.model_version + ' while this page recomputes under radar-2, so a difference is expected until the board is rebuilt under radar-2.' : ' The board and the page disagree: treat the board figure as stale.')) +
      ' This is an estimate, not a price.';
    dialog.textContent = '';
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value — model breakdown' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Category multiple (' + (row.category || 'Other') + ' — ' + catMultSource(row) + ')' }), el('b', { class: 'num', text: fmtMult(rec.catMult) })),
        el('div', null, el('span', { text: 'Growth: ' + fmtPct(row.change_7d) + ' clamped to ' + fmtPct(rec.growthPct) }), el('b', { class: 'num', text: fmtMult(rec.growthMult) })),
        el('div', null, el('span', { text: 'Breadth: ' + rec.nChains + ' chain' + (rec.nChains === 1 ? '' : 's') }), el('b', { class: 'num', text: fmtMult(rec.breadthMult) })),
        el('div', null, el('span', { text: 'Maturity: ' + fmtAge(row.age_days) + (row.age_days === null ? ' (unknown: 365d)' : '') }), el('b', { class: 'num', text: fmtMult(rec.maturityMult) })),
        el('div', { class: 'total' }, el('span', { text: 'Implied value (recomputed)' }), el('b', { class: 'num', text: fmtUsd(rec.implied) })),
        el('div', null, el('span', { text: 'Implied value (board)' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      carried.length ? el('p', { class: 'sub', text: 'Note: ' + carried.join('; ') + '.' }) : null,
      el('p', { class: match ? 'check ok' : 'check warn', text: (match ? '✓ Recompute check: matches. ' : '⚠ Recompute check: differs. ') + checkText })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('p', { class: 'sub', text: 'Derived from this protocol’s own record: the category picks the action, TVL picks the capital ($' + capitalFor(row) + '), age picks the hold (' + holdDaysFor(row.age_days) + ' days).' }),
      el('ol', { class: 'steps' }, farmSteps(row).map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    var old = app.querySelector('.shell');
    if (old) old.remove();
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    if (dialog.isConnected) app.insertBefore(shell, dialog);
    else app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) {
      var exists = DATA.rows.some(function (r) { return r.slug === state.selected; });
      if (exists && !dialog.open) openDetail(state.selected);
      if (!exists) { state.selected = null; writeHash(); }
    }
  }

  readHash();
  render();
  window.addEventListener('hashchange', function () { readHash(); render(); });
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
