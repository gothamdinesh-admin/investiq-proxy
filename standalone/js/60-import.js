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
