// ═══════════════════════════════════════════════════════════════════════
// 60-import.js — CSV import, eToro demo loader, ticker normalisation.
// Depends on: 00-config.js, 10-helpers.js (uuid), 20-state.js (state).
// Forward refs (resolved lazily at call time, defined in inline <script>):
//   consolidatePortfolio(), saveState(), renderAll(), updateTicker(),
//   refreshMarketData(), refreshPortfolioPrices(), recordDailySnapshot(),
//   logActivity(), toast (global IIFE in inline).
// ═══════════════════════════════════════════════════════════════════════

// ===== DIRECT ETORO IMPORT =====
function loadEtoroHoldings() {
  const rows = [
    ["NVDA","eToro",3.00722,201.64,"United States","stock"],
    ["SYM","eToro",5.35142,63.17,"United States","stock"],
    ["GOOG","eToro",1.07698,339.40,"United States","stock"],
    ["INTC","eToro",3.12726,68.51,"United States","stock"],
    ["MRVL","eToro",1.44217,139.69,"United States","stock"],
    ["AMD","eToro",1.13538,278.26,"United States","stock"],
    ["AMZN","eToro",2.03467,250.56,"United States","stock"],
    ["AAPL","eToro",1.49373,270.23,"United States","stock"],
    ["TSM","eToro",0.61374,370.50,"International","stock"],
    ["AVGO","eToro",0.27890,406.51,"United States","stock"],
    ["AZN.L","eToro",0.714321,15088.00,"United Kingdom","stock"],
    ["EME","eToro",0.17973,804.86,"United States","stock"],
    ["ROK","eToro",0.19619,415.73,"United States","stock"],
    ["ARKK","eToro",1.01817,79.26,"United States","etf"],
    ["WPM","eToro",1.50279,152.38,"Canada","stock"],
    ["URA","eToro",5.85366,55.85,"Global","etf"],
    ["GLD","eToro",0.83027,445.93,"Global","etf"],
    ["BROS","eToro",1.35980,53.44,"United States","stock"],
    ["VOO","eToro",0.18752,652.78,"United States","etf"],
    ["NEE","eToro",1.20403,91.98,"United States","stock"],
    ["UBER","eToro",1.55982,77.12,"United States","stock"],
    ["ZVRA","eToro",3.67260,10.66,"United States","stock"],
    ["GE","eToro",0.37789,304.13,"United States","stock"],
    ["XOP","eToro",1.97613,159.66,"United States","etf"],
    ["BA","eToro",0.49918,223.38,"United States","stock"],
    ["SHOP","eToro",0.46620,131.15,"International","stock"],
    ["TSLA","eToro",0.27142,400.71,"United States","stock"],
    ["BABA","eToro",0.43040,141.01,"China","stock"],
    ["LLY","eToro",0.06414,927.03,"United States","stock"],
    ["AIR.PA","eToro",0.503428,179.48,"Europe","stock"],
    ["META","eToro",0.29672,688.55,"United States","stock"],
    ["AS","eToro",1.35627,37.10,"International","stock"],
    ["CPI.L","eToro",8.358227,293.50,"United Kingdom","stock"],
    ["COST","eToro",0.14786,999.68,"United States","stock"],
    ["DDOG","eToro",0.34802,126.61,"United States","stock"],
    ["SMH","eToro",0.64890,464.16,"United States","etf"],
    ["MET","eToro",1.27747,78.08,"United States","stock"],
    ["MSFT","eToro",0.99531,422.79,"United States","stock"],
    ["OKLO","eToro",0.72748,66.84,"United States","stock"],
    ["00285.HK","eToro",12.562436,28.30,"China","stock"],
    ["IBM","eToro",0.38145,253.51,"United States","stock"],
    ["UNH","eToro",0.59856,324.45,"United States","stock"],
    ["V","eToro",0.28768,317.05,"United States","stock"],
    ["ETOR","eToro",0.92936,37.67,"United States","stock"],
    ["LGVN","eToro",9.30233,1.10,"United States","stock"],
    ["KTOS","eToro",2.63466,70.99,"United States","stock"],
    ["SNOW","eToro",0.60060,143.98,"United States","stock"],
    ["DKNG","eToro",1.12918,22.82,"United States","stock"],
    ["ADBE","eToro",0.27397,244.45,"United States","stock"],
    ["PLTR","eToro",2.83977,146.39,"United States","stock"],
    ["BEEM","eToro",6.66667,1.52,"United States","stock"],
    ["ORCL","eToro",0.32525,175.07,"United States","stock"],
    ["SOL","eToro",0.535122,88.97,"Global","crypto"],
    ["NAAS","eToro",1.63613,2.30,"China","stock"],
    ["TIA","eToro",9.206407,0.427,"Global","crypto"],
    ["DOGE","eToro",257.049584,0.10024,"Global","crypto"],
    ["LTC","eToro",2.59787,56.63,"Global","crypto"],
    ["ETH","eToro",0.249629,2427.39,"Global","crypto"],
    ["AVAX","eToro",5.035008,9.77,"Global","crypto"],
    ["BTC","eToro",0.032682,77362.49,"Global","crypto"]
  ];
  let added = 0, skipped = 0;
  rows.forEach(([symbol, platform, quantity, price, country, type]) => {
    const exists = state.portfolio.some(h => h.symbol === symbol && h.platform === platform);
    if (exists) { skipped++; return; }
    state.portfolio.push({
      id: uuid(), symbol, name: symbol, type, platform,
      currency: 'USD', sector: type === 'crypto' ? 'Crypto' : type === 'etf' ? 'ETF' : 'Equity',
      country, notes: 'Imported from eToro',
      currentPrice: null, dayChange: null, dayChangePct: null,
      lots: [{ quantity, price, date: '' }]
    });
    added++;
  });
  state.portfolio = consolidatePortfolio(state.portfolio);
  saveState();
  renderAll();
  toast.success({ title: 'eToro import complete', message: `Loaded ${added} holdings${skipped ? ` (${skipped} already existed)` : ''}. Fetching live prices…` });
  // Fetch market data (FX rates) first, then portfolio prices
  refreshMarketData().then(() => refreshPortfolioPrices()).then(() => { renderAll(); updateTicker(); });
}

// ===== CSV IMPORT =====
function parseCSVLine(line) {
  // Handles: standard CSV, fully-quoted rows like "a,b,c", mixed quoting
  const trimmed = line.trim();
  if (!trimmed) return [];
  const result = [];
  let cur = '', inQ = false;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === '"') {
      if (inQ && trimmed[i+1] === '"') { cur += '"'; i++; } // escaped quote
      else inQ = !inQ;
    } else if (ch === ',' && !inQ) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur.trim());
  // If the whole row parsed as ONE field and it contains commas, it was wrapped in outer quotes
  if (result.length === 1 && result[0].includes(',')) {
    return result[0].split(',').map(c => c.trim());
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════════════
// NZ DISCLOSE REGISTER — Full Portfolio Holdings importer
// ───────────────────────────────────────────────────────────────────────
// Handles the regulatory "Full Portfolio Holdings" CSV (the format Harbour's
// fund holdings export uses). It is WEIGHTS-based, not value-based:
//   row 1-4   metadata (DISCLOSE REGISTER header, Offer/Fund name, Period)
//   row 5     "Asset name,% of fund net assets,Security code,"
//   row 6..N  "<name>,<X.XX%>,<ISIN-or-blank>,"  — sorted by weight desc,
//             ending in negative-weight derivatives (FX forwards + IRS legs).
// No units, no prices. We import each holding's WEIGHT as its value (×1), so
// the app's allocation / concentration / weight maths reproduce the % of fund.
// Per the agreed design: securities ≥0.10% individually; the long tail rolled
// up per asset-type; derivatives netted into two "overlay" summary lines.
// ═══════════════════════════════════════════════════════════════════════

// Detect the Disclose format from the raw file text (before column parsing).
function isDiscloseFormat(text) {
  return /disclose register/i.test(text)
      || /^\s*asset name\s*,\s*% of fund net assets/im.test(text);
}

// Classify a Disclose row into the app's asset types + flag derivatives.
function _discloseClassify(name, code) {
  const n = (name || '').toUpperCase();
  if (/\bIRS\b|PAYABLE LEG|RECEIVABLE LEG|\bSWAP\b/.test(n)) return { type: 'other', kind: 'rates' };
  if (/:BUY |:SELL |^(SELL|BUY) .+:|\bFORWARD\b|\bFWD\b/.test(n)) return { type: 'other', kind: 'fx' };
  if (/\bDOLLAR\b|^CASH\b|\bCASH$/.test(n)) return { type: 'cash' };
  if (/GOVERNMENT STOCK|SOVEREIGN|TREASURY|\bBOND\b|\bNOTE\b|\bBILL\b|\bGOVT\b|\bIN \d|\d{2}\/\d{2}\/\d{2,4}/.test(n)
      || (code && /GOVDT|GOVT/i.test(code))) return { type: 'bond' };
  if (/\bFUND\b|\bPIE\b|\bTRUST\b|\bETF\b/.test(n)) return { type: 'fund' };
  return { type: 'stock' };
}
// ISIN prefix → country / currency (best-effort; blank ISIN ⇒ NZ default).
const _ISIN_COUNTRY = { NZ:'New Zealand', AU:'Australia', US:'United States', GB:'United Kingdom', IE:'Ireland', DE:'Germany', FR:'France', NL:'Netherlands', CH:'Switzerland', JP:'Japan', CA:'Canada', HK:'Hong Kong', SG:'Singapore', KY:'Cayman Islands', LU:'Luxembourg', BM:'Bermuda' };
const _ISIN_CCY     = { NZ:'NZD', AU:'AUD', US:'USD', GB:'GBP', IE:'EUR', DE:'EUR', FR:'EUR', NL:'EUR', LU:'EUR', CH:'CHF', JP:'JPY', CA:'CAD', HK:'HKD', SG:'SGD' };
function _isinCountry(code){ return _ISIN_COUNTRY[(code||'').slice(0,2).toUpperCase()] || ''; }
function _isinCcy(code){ return _ISIN_CCY[(code||'').slice(0,2).toUpperCase()] || 'NZD'; }
const _DISCLOSE_SECTOR = { stock:'Equity', bond:'Fixed income', fund:'Managed fund', cash:'Cash', other:'Derivative/overlay' };
const _DISCLOSE_TAIL_LABEL = { stock:'equities', bond:'bonds', fund:'funds', cash:'cash holdings', other:'other' };

// Build a weight-based holding object the rest of the app understands.
// value = weight × 1 (currentPrice 1, quantity = weight). manualPrice flags it
// so the price refresh skips it (these have no Yahoo-resolvable ticker).
function _discloseHolding({ symbol, name, type, weight, code }) {
  return {
    id: uuid(), symbol, name, type,
    platform: 'Fund holdings',
    // Weights are already NZD-based % of fund, so value must NOT be FX-converted.
    // currency stays NZD (getMetrics multiplies by getFxRate(currency, base)).
    // nativeCurrency keeps the issue currency for future FX-exposure analysis.
    currency: 'NZD',
    nativeCurrency: _isinCcy(code),
    sector: _DISCLOSE_SECTOR[type] || 'Other',
    country: _isinCountry(code),
    securityCode: code || '',
    notes: code ? `ISIN ${code}` : '',
    currentPrice: 1, dayChange: null, dayChangePct: null,
    manualPrice: true, source: 'disclose',
    lots: [{ quantity: weight, price: 1, date: '', note: 'Disclose import (weight basis)' }]
  };
}

// Parse a Disclose CSV into { fundName, holdings, stats }. Pure — no side effects.
function parseDiscloseCSV(text) {
  const lines = text.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  let fundName = '', headerIdx = -1, asAt = '', asAtISO = '';
  for (let i = 0; i < lines.length; i++) {
    if (/^fund name\s*,/i.test(lines[i])) {
      const c = parseCSVLine(lines[i]); fundName = (c[1] || '').trim();
    }
    if (/^period disclosure applies/i.test(lines[i])) {
      const c = parseCSVLine(lines[i]);
      const raw = (c[1] || '').trim();
      const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(raw);   // dd/mm/yyyy
      if (m) {
        const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        asAt = `${(+m[1])} ${MON[(+m[2]) - 1] || ''} ${m[3]}`.trim();
        asAtISO = `${m[3]}-${String(+m[2]).padStart(2,'0')}-${String(+m[1]).padStart(2,'0')}`;
      } else if (raw) { asAt = raw; }
    }
    if (/^\s*asset name\s*,\s*% of fund net assets/i.test(lines[i])) { headerIdx = i; break; }
  }
  if (headerIdx === -1) return { fundName, asAt, asAtISO, holdings: [], stats: null };

  const TH = 0.10; // weight % threshold for an individual line
  const individual = [];
  const tail = {};            // type → { w, n }
  let fxNet = 0, ratesNet = 0, fxCount = 0, ratesCount = 0, rows = 0;

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cells = parseCSVLine(lines[i]);
    if (cells.length < 2) continue;
    const name = (cells[0] || '').trim();
    const weight = parseFloat((cells[1] || '').replace('%', '').replace(/[^0-9.\-]/g, ''));
    const code = (cells[2] || '').trim();
    if (!name || isNaN(weight)) continue;
    rows++;
    const c = _discloseClassify(name, code);
    if (c.kind === 'fx')    { fxNet += weight;    fxCount++;    continue; }
    if (c.kind === 'rates') { ratesNet += weight; ratesCount++; continue; }
    if (Math.abs(weight) >= TH) {
      individual.push(_discloseHolding({ symbol: name.slice(0, 60), name, type: c.type, weight, code }));
    } else {
      (tail[c.type] = tail[c.type] || { w: 0, n: 0 });
      tail[c.type].w += weight; tail[c.type].n++;
    }
  }

  const holdings = [...individual];
  // Aggregated long tail — one line per asset type.
  Object.entries(tail).forEach(([type, o]) => {
    if (o.n === 0 || Math.abs(o.w) < 0.005) return;
    const label = _DISCLOSE_TAIL_LABEL[type] || type;
    holdings.push(_discloseHolding({
      symbol: `OTHER-${type.toUpperCase()}`,
      name: `Other ${label} (${o.n} holding${o.n === 1 ? '' : 's'} <0.10%)`,
      type, weight: o.w, code: ''
    }));
  });
  // Derivative overlay — two info lines (value 0; net % carried in the name).
  const overlay = (sym, label, net, count) => {
    const h = _discloseHolding({ symbol: sym, name: `${label} · net ${net >= 0 ? '+' : ''}${net.toFixed(2)}% of NAV (${count} contracts)`, type: 'other', weight: 0, code: '' });
    h.lots = [{ quantity: 0, price: 0, date: '', note: 'overlay summary' }];
    h.sector = 'Derivative/overlay'; h.overlayNet = net;
    return h;
  };
  if (fxCount)    holdings.push(overlay('FX-HEDGES', 'FX hedges', fxNet, fxCount));
  if (ratesCount) holdings.push(overlay('RATES-OVERLAY', 'Rates / IRS overlay', ratesNet, ratesCount));

  return {
    fundName, asAt, asAtISO,
    holdings,
    stats: {
      rows, individual: individual.length,
      aggregated: Object.values(tail).reduce((s, o) => s + o.n, 0),
      tailLines: Object.keys(tail).length,
      fxNet, ratesNet, fxCount, ratesCount
    }
  };
}

// Normalise common ticker aliases so Yahoo Finance can find them.
// Without this, BTC/ETH/etc. return bogus prices (Yahoo has different symbols).
const CRYPTO_ALIAS = {
  'BTC':'BTC-USD', 'BITCOIN':'BTC-USD',
  'ETH':'ETH-USD', 'ETHEREUM':'ETH-USD',
  'SOL':'SOL-USD', 'ADA':'ADA-USD', 'XRP':'XRP-USD', 'DOGE':'DOGE-USD',
  'DOT':'DOT-USD', 'AVAX':'AVAX-USD', 'MATIC':'MATIC-USD',
  'LINK':'LINK-USD', 'LTC':'LTC-USD', 'BCH':'BCH-USD',
  'BNB':'BNB-USD', 'ATOM':'ATOM-USD', 'SHIB':'SHIB-USD', 'TRX':'TRX-USD'
};
function normaliseSymbol(sym, type) {
  if (!sym) return sym;
  const upper = sym.toUpperCase().trim();
  // If already has -USD suffix or a period (exchange suffix like AZN.L), leave it
  if (upper.includes('-') || upper.includes('.')) return upper;
  const isCrypto = (type || '').toLowerCase().includes('crypto');
  if (CRYPTO_ALIAS[upper] && (isCrypto || upper.length <= 5)) return CRYPTO_ALIAS[upper];
  return upper;
}

// Prevent double-fire of the file input (known browser quirk on some drag-drop flows)
// and prevent Supabase from reloading stale data mid-import.
let _importInProgress = false;

async function importCSV(event) {
  // NOTE: combined "All portfolios" view is NOT blocked here. Import is fine
  // from combined view because the destination picker below forces choosing a
  // real portfolio, which exits combined view before any write happens.
  // Hard guard: if another import is in flight, ignore this event
  if (_importInProgress) {
    console.warn('[csv-import] Ignored duplicate import event while already importing');
    if (event?.target) event.target.value = '';
    return;
  }
  _importInProgress = true;
  try {
    await _importCSVImpl(event);
  } finally {
    _importInProgress = false;
  }
}

async function _importCSVImpl(event) {
  const file = event.target.files[0];
  if (!file) return;
  event.target.value = ''; // reset so same file can be re-imported

  // Multi-portfolio: ask which portfolio to import INTO (defaults to active).
  // The rest of the import writes to state.portfolio (the active one), so we
  // just switch active to the chosen target first.
  if (typeof listPortfolios === 'function' && listPortfolios().length > 1) {
    const choice = await showFormModal({
      title: 'Import into which portfolio?',
      icon: 'fa-file-import',
      description: 'This CSV will be merged into the portfolio you choose.',
      fields: [{
        name: 'pid', label: 'Portfolio', type: 'select',
        value: state.activePortfolioId,
        options: listPortfolios().map(p => ({ value: p.id, label: `${p.name} (${(p.holdings||[]).length})` }))
      }],
      submitLabel: 'Continue'
    });
    if (!choice) return; // cancelled — abort import
    // Always switch to the chosen portfolio. setActivePortfolio also EXITS
    // combined view — important, otherwise the read-only accessor would
    // swallow the import as a no-op. Safe to call even if pid is unchanged.
    if (choice.pid) {
      setActivePortfolio(choice.pid);
      if (typeof renderPortfolioSwitcher === 'function') renderPortfolioSwitcher();
    }
  }

  // Security: cap CSV at 5MB. A real portfolio CSV is < 100KB; anything
  // bigger is either junk or hostile. Prevents DoS via huge file.
  const MAX_CSV_BYTES = 5 * 1024 * 1024;
  if (file.size > MAX_CSV_BYTES) {
    toast.error({ title: 'CSV too large', message: `${(file.size/1024/1024).toFixed(1)} MB exceeds the 5 MB limit. A typical portfolio CSV is well under 100 KB.` });
    return;
  }
  // Sanity: refuse non-CSV mime types where reliable
  const validMimes = ['text/csv', 'application/vnd.ms-excel', 'application/octet-stream', 'text/plain', ''];
  if (file.type && !validMimes.includes(file.type)) {
    toast.warning(`File type "${file.type}" doesn't look like CSV — trying anyway.`);
  }

  let text;
  try {
    text = await file.text();
  } catch(e) {
    toast.error('Could not read file: ' + e.message); return;
  }

  // Strip BOM, normalise line endings
  text = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  // ── NZ Disclose Register (fund full-holdings) takes a dedicated path ──
  // It's weights-based with metadata header rows, so the column parser below
  // doesn't apply. importDiscloseHoldings handles parse + replace + rename.
  if (isDiscloseFormat(text)) {
    await importDiscloseHoldings(text);
    return;
  }

  const lines = text.trim().split('\n').filter(l => l.trim());
  if (lines.length < 2) { toast.error('CSV is empty or has only a header row.'); return; }

  const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim());
  const col = h => headers.indexOf(h);

  // Support both column name variations (including eToro export format)
  const iSym   = col('symbol') >= 0 ? col('symbol') : col('ticker') >= 0 ? col('ticker') : col('instrument');
  const iPlat  = col('platform') >= 0 ? col('platform') : col('broker');
  const iQty   = col('quantity') >= 0 ? col('quantity') : col('units') >= 0 ? col('units') : col('shares');
  // Price: our format → eToro "open rate" → generic "price"/"buyprice" → fallback from invested/amount
  const iPrice = col('purchaseprice') >= 0 ? col('purchaseprice')
               : col('avgcost')       >= 0 ? col('avgcost')
               : col('averagecost')   >= 0 ? col('averagecost')
               : col('avg cost')      >= 0 ? col('avg cost')
               : col('average cost')  >= 0 ? col('average cost')
               : col('open rate')     >= 0 ? col('open rate')
               : col('openrate')      >= 0 ? col('openrate')
               : col('buyprice')      >= 0 ? col('buyprice')
               : col('price')         >= 0 ? col('price')
               : -1;
  // Invested/amount fallback — used to compute price when no price column exists
  const iInvested = col('invested') >= 0 ? col('invested') : col('amount') >= 0 ? col('amount') : col('cost') >= 0 ? col('cost') : -1;
  const iCur  = col('currency');
  const iTyp  = col('type') >= 0 ? col('type') : col('assettype');
  const iName = col('name') >= 0 ? col('name') : col('instrument');
  const iSect = col('sector');
  const iCtry = col('country') >= 0 ? col('country') : col('region');
  const iDate = col('purchasedate') >= 0 ? col('purchasedate') : col('date');
  const iNote = col('notes') >= 0 ? col('notes') : col('note');

  if (iSym === -1) {
    toast.error({ title: 'CSV missing "symbol" column', message: 'Found: ' + headers.join(', ') }); return;
  }

  const typeMap = {
    'stock':'stock','equity etf':'etf','commodity etf':'etf','etf':'etf',
    'crypto':'crypto','bond':'bond','cash':'cash','mutualfund':'mutualfund','other':'other'
  };

  // Case-insensitive platform normaliser (so "eToro", "etoro", "Etoro" all match)
  const normPlat = (p) => (p || '').trim().toLowerCase();

  // Single mode now: SMART MERGE. Match existing holdings by symbol+platform,
  // update quantity/price to match CSV (CSV is truth for each matched row),
  // create new entries for anything unseen, leave other platforms untouched.
  // If "Replace all" is checked, wipe everything first for a clean slate.
  const replaceAll = document.getElementById('csvReplaceAll')?.checked || false;
  let removedCount = 0;
  if (replaceAll) {
    if (!confirm(`"Replace all" is checked.\n\nThis will DELETE all ${state.portfolio.length} existing holdings across all platforms, then import from this CSV.\n\nContinue?`)) {
      toast.info('Import cancelled.'); return;
    }
    removedCount = state.portfolio.length;
    state.portfolio = [];
    // Reset the checkbox so it doesn't persist silently into the next import
    const rc = document.getElementById('csvReplaceAll'); if (rc) rc.checked = false;
  }

  console.log(`[csv-import] smart-merge | existing holdings=${state.portfolio.length} | existing platforms=${JSON.stringify([...new Set(state.portfolio.map(h => h.platform))])} | replaceAll=${replaceAll}`);

  let updated = 0, newCreated = 0, skipped = 0;
  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i]);
    if (lines[i].trim().startsWith('#')) continue; // skip comment lines
    const rawSym = row[iSym]?.trim();
    if (!rawSym || rawSym === 'symbol' || rawSym === 'ticker') { skipped++; continue; }

    const symbol   = normaliseSymbol(rawSym.toUpperCase(), iTyp >= 0 ? (row[iTyp]||'').trim().toLowerCase() : '');
    const platform = iPlat >= 0 ? (row[iPlat]?.trim() || 'Imported') : 'Imported';
    const quantity = iQty  >= 0 ? (parseFloat(row[iQty])  || 0) : 0;
    // Compute price: direct column first, then derive from invested ÷ quantity
    let buyPrice = iPrice >= 0 ? (parseFloat(row[iPrice]) || 0) : 0;
    if (!buyPrice && iInvested >= 0 && quantity > 0) {
      const invested = parseFloat(row[iInvested]) || 0;
      if (invested > 0) buyPrice = invested / quantity;
    }
    const currency = iCur  >= 0 ? (row[iCur]?.trim().toUpperCase() || 'USD') : 'USD';
    const rawType  = iTyp  >= 0 ? (row[iTyp]?.trim().toLowerCase() || 'stock') : 'stock';
    const assetType= typeMap[rawType] || 'stock';
    const name     = iName >= 0 ? (row[iName]?.trim() || symbol) : symbol;
    const sector   = iSect >= 0 ? (row[iSect]?.trim() || '') : '';
    const country  = iCtry >= 0 ? (row[iCtry]?.trim() || '') : '';
    const date     = iDate >= 0 ? (row[iDate]?.trim() || '') : '';
    const notes    = iNote >= 0 ? (row[iNote]?.trim() || '') : '';

    // Match existing holding: symbol+platform first, symbol-only fallback
    let existing = state.portfolio.find(h =>
      (h.symbol || '').toUpperCase().trim() === symbol &&
      normPlat(h.platform) === normPlat(platform)
    );
    if (!existing) {
      existing = state.portfolio.find(h =>
        (h.symbol || '').toUpperCase().trim() === symbol
      );
      if (existing) {
        console.log(`[csv-import] symbol-only fallback: ${symbol} matched existing on platform "${existing.platform}" (CSV: "${platform}")`);
      }
    }

    if (existing) {
      // SMART MERGE: CSV is the authoritative current state for this holding.
      // Consolidate into a SINGLE clean lot with CSV quantity and CSV price.
      const finalPrice = buyPrice || getHoldingBasis(existing).avgBuyPrice || 0;
      existing.lots = [{
        quantity,
        price: finalPrice,
        date: date || new Date().toISOString().slice(0,10),
        note: 'CSV import'
      }];
      if (name && name !== symbol) existing.name = name;
      if (sector)  existing.sector  = sector;
      if (country) existing.country = country;
      if (currency) existing.currency = currency;
      existing.platform = platform;
      updated++;
    } else {
      state.portfolio.push({
        id: uuid(), symbol, name, type: assetType, platform,
        currency, sector: sector || (assetType==='crypto'?'Crypto':assetType==='etf'?'ETF':'Equity'),
        country, notes, currentPrice: null, dayChange: null, dayChangePct: null,
        lots: [{ quantity, price: buyPrice, date, note: '' }]
      });
      newCreated++;
    }
  }

  if (updated === 0 && newCreated === 0 && skipped === 0) {
    toast.warning('No data rows found. Check your CSV has data below the header row.'); return;
  }

  saveState();
  renderAll();
  const parts = [];
  if (updated)    parts.push(`${updated} existing holdings updated`);
  if (newCreated) parts.push(`${newCreated} new holdings created`);
  if (removedCount) parts.push(`${removedCount} cleared before re-import`);
  if (skipped)    parts.push(`${skipped} rows skipped`);
  console.log(`[csv-import] ✓ ${parts.join(' · ')}`);

  // Snapshot date captured from the date picker next to the import button
  const snapshotDate = (document.getElementById('csvImportDate')?.value || '').trim()
    || new Date().toISOString().slice(0,10);

  toast.success({ title: 'CSV import complete', message: `${parts.join(' · ')}\nSnapshot: ${snapshotDate} · Fetching prices…`, duration: 6000 });
  logActivity('csv_import', { updated, newCreated, removedCount, skipped, snapshotDate, replaceAll });

  // Fetch live prices, then force a snapshot using the chosen date
  refreshMarketData()
    .then(() => refreshPortfolioPrices())
    .then(() => {
      renderAll(); updateTicker();
      recordDailySnapshot({ date: snapshotDate, force: true, source: 'csv-import' });
    });
}

// Import an NZ Disclose Register holdings file into the ACTIVE portfolio.
// A fund's full holdings are a complete set, so this REPLACES (not merges)
// and renames the portfolio to the fund. Weight-based: no price fetch.
async function importDiscloseHoldings(text) {
  const { fundName, asAt, asAtISO, holdings, stats } = parseDiscloseCSV(text);
  if (!holdings.length) {
    toast.error({ title: 'No holdings found', message: 'This looks like a Disclose file but no asset rows parsed. Check the "Asset name,% of fund net assets,Security code" header is present.' });
    return;
  }

  const active = getActivePortfolio();
  const existing = (active.holdings || []).length;
  const ok = await showFormModal({
    title: 'Import fund holdings',
    icon: 'fa-building-columns',
    description: `Import <b>${holdings.length}</b> lines from <b>${fundName || 'this fund'}</b> into "<b>${active.name}</b>"?` +
      (existing ? `<br><br>This <b>replaces</b> the ${existing} holdings currently in this portfolio.` : '') +
      `<br><br><span style="color:#94a3b8;font-size:12px;">${stats.individual} securities ≥0.10% · ${stats.aggregated} smaller positions rolled into ${stats.tailLines} "Other …" lines · derivatives netted into overlay summaries. Figures are <b>% of fund (weight basis)</b> — no prices.</span>`,
    submitLabel: existing ? 'Import & replace' : 'Import',
    submitVariant: existing ? 'danger' : 'primary'
  });
  if (!ok) { toast.info('Import cancelled.'); return; }

  // Replace the active portfolio's holdings + rename it to the fund.
  state.portfolio = holdings;
  if (fundName) renamePortfolio(active.id, fundName);
  // Stamp fund metadata on the portfolio (drives the "as at" badge + weight view).
  active.fund = { name: fundName || active.name, asAt: asAt || '', asAtISO: asAtISO || '', importedRows: stats.rows };
  // Record this period for the Disclosure History page (period-over-period diff).
  if (typeof _saveDiscloseHistory === 'function') {
    _saveDiscloseHistory(fundName || active.name, asAtISO, asAt,
      holdings.map(h => ({ n: h.name, w: (h.lots && h.lots[0] ? h.lots[0].quantity : 0), t: h.type })));
  }

  saveState();
  if (typeof renderPortfolioSwitcher === 'function') renderPortfolioSwitcher();
  renderAll();

  const overlayBits = [];
  if (stats.fxCount)    overlayBits.push(`FX hedges net ${stats.fxNet >= 0 ? '+' : ''}${stats.fxNet.toFixed(1)}%`);
  if (stats.ratesCount) overlayBits.push(`rates net ${stats.ratesNet >= 0 ? '+' : ''}${stats.ratesNet.toFixed(1)}%`);
  toast.success({
    title: `${fundName || 'Fund'} imported`,
    message: `${stats.individual} holdings + ${stats.tailLines} aggregated tail line(s) from ${stats.rows} disclosed positions.` +
      (overlayBits.length ? `\nOverlay: ${overlayBits.join(' · ')}.` : '') +
      `\nWeight basis (% of fund) — no live prices fetched.`,
    duration: 8000
  });
  logActivity('disclose_import', {
    fundName, total: holdings.length, individual: stats.individual,
    aggregated: stats.aggregated, fxNet: stats.fxNet, ratesNet: stats.ratesNet
  });
}

function downloadCSVTemplate() {
  const headers = 'symbol,platform,quantity,purchasePrice,purchaseDate,currency,type,name,sector,country,notes';
  const examples = [
    '# HOW AVERAGE COST WORKS:',
    '# Add one row per purchase lot for the same symbol.',
    '# InvestIQ automatically computes the weighted average cost across all lots.',
    '# Example: NVDA bought twice → average cost is auto-calculated from both rows.',
    'NVDA,eToro,3,148.30,2024-01-15,USD,stock,NVIDIA Corporation,Technology,United States,First buy',
    'NVDA,eToro,2,210.50,2024-06-01,USD,stock,NVIDIA Corporation,Technology,United States,Top-up at higher price',
    '# The above two rows = 5 units at avg cost of (3×148.30 + 2×210.50)/5 = $173.18',
    '',
    '# SINGLE PURCHASE (most common):',
    'AAPL,eToro,5,207.53,2024-03-10,USD,stock,Apple Inc.,Technology,United States,',
    'MSFT,eToro,1,423.99,2024-02-01,USD,stock,Microsoft Corp.,Technology,United States,',
    'VOO,Sharesies,2,533.28,2024-01-20,USD,etf,Vanguard S&P 500 ETF,Index,United States,',
    '',
    '# SUPPORTED ASSET TYPES: stock | etf | crypto | bond | cash | mutualfund | realestate | other',
    '# SUPPORTED CURRENCIES: USD | NZD | AUD | GBP | EUR | HKD | SGD',
    '',
    '# ETORO TIP: Export from eToro → use "Open Rate" as your purchasePrice,',
    '# and "Units" as your quantity. Or use the eToro import button instead.',
    'TSM,eToro,0.61,244.35,2024-01-10,USD,stock,Taiwan Semiconductor,Technology,Taiwan,',
    'AZN.L,eToro,0.71,10434.00,2024-02-20,GBP,stock,AstraZeneca PLC,Healthcare,United Kingdom,',
    'BTC-USD,eToro,0.05,45000.00,2024-03-10,USD,crypto,Bitcoin,Crypto,Global,'
  ];
  const csv = [headers, ...examples].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'investiq-holdings-template.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}
