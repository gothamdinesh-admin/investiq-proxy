// ═══════════════════════════════════════════════════════════════════════
// 50-portfolio.js — Portfolio math, FX, ticker hygiene, market refresh.
// Depends on: 00-config.js (PLATFORM_CONFIG, CORS_PROXIES),
//             10-helpers.js (uuid), 20-state.js (state),
//             60-import.js (CRYPTO_ALIAS, normaliseSymbol).
// Forward refs (resolved lazily at call time, declared inline):
//   saveState(), renderAll(), updateTicker(), updatePortfolioTicker(),
//   renderMarketSection(), proxyHeaders(), toast.
// Pure-ish business logic: consolidatePortfolio, autoNormalizeTickers,
// healDuplicates, getFxRate, getHoldingBasis, isPenceQuoted, getMetrics,
// calcDiversificationScore, MARKET_SYMBOLS, fetchYahooQuotes,
// refreshMarketData, refreshPortfolioAndPrices, refreshPortfolioPrices.
// ═══════════════════════════════════════════════════════════════════════

function consolidatePortfolio(holdings) {
  const merged = new Map();
  const duplicateLog = [];
  (holdings || []).forEach(raw => {
    const h = normalizeHoldingLots(raw);
    const key = holdingKey(h);
    if (!key || key === '::') return;
    if (!merged.has(key)) {
      merged.set(key, {
        ...h,
        id: h.id || uuid(),
        lots: [...(h.lots || [])]
      });
      return;
    }
    // DUPLICATE KEY — previously we concatenated lots which caused the
    // "value doubled on cross-browser load" bug. Now: dedupe lots by
    // (date + quantity + price) signature so re-importing the same data
    // doesn't double-count. Only genuinely new lots are appended.
    const existing = merged.get(key);
    const existingSig = new Set(
      (existing.lots || []).map(l =>
        `${l.date||''}::${(+l.quantity||0).toFixed(6)}::${(+l.price||0).toFixed(6)}`
      )
    );
    const incomingNewLots = (h.lots || []).filter(l => {
      const sig = `${l.date||''}::${(+l.quantity||0).toFixed(6)}::${(+l.price||0).toFixed(6)}`;
      return !existingSig.has(sig);
    });
    if ((h.lots || []).length && !incomingNewLots.length) {
      duplicateLog.push(`${key}: all ${h.lots.length} incoming lot(s) already present — skipped`);
    } else if (incomingNewLots.length < (h.lots || []).length) {
      duplicateLog.push(`${key}: merged ${incomingNewLots.length} new lot(s), skipped ${(h.lots||[]).length - incomingNewLots.length} duplicate(s)`);
    }
    existing.lots = [...(existing.lots || []), ...incomingNewLots];
    existing.name = existing.name || h.name;
    existing.type = existing.type || h.type;
    existing.platform = existing.platform || h.platform;
    existing.currency = existing.currency || h.currency;
    existing.sector = existing.sector || h.sector;
    existing.country = existing.country || h.country;
    existing.notes = [existing.notes, h.notes].filter(Boolean).join(' | ');
    if (h.currentPrice != null) existing.currentPrice = h.currentPrice;
    if (h.dayChange != null) existing.dayChange = h.dayChange;
    if (h.dayChangePct != null) existing.dayChangePct = h.dayChangePct;
  });
  if (duplicateLog.length) {
    console.warn('[consolidatePortfolio] duplicate keys found and lot-deduped:\n  • ' + duplicateLog.join('\n  • '));
  }
  return [...merged.values()];
}

// ===== STORAGE =====
// loadState moved to js/20-state.js

// Self-healing duplicate check — runs on load + after any sync.
// TWO passes:
//   Pass 1: merge duplicate HOLDINGS (same symbol+platform appearing twice+)
//   Pass 2: within each holding, collapse duplicate LOTS (same qty+price even
//           if dates differ by < 7 days — catches the pre-fix cloud state
//           where daily sync accumulated near-identical lots with different
//           auto-assigned dates, which was the root cause of value doubling).
// Run on EVERY load (localStorage + cloud) so stale ticker aliases never come back.
// Catches the case where cloud has an old `BTC` row that somehow survived an
// earlier cleanup — auto-converts to `BTC-USD` and merges with any existing
// BTC-USD entry. Returns true if anything changed.
function autoNormalizeTickers(silent = true) {
  if (!state.portfolio?.length) return false;
  let changed = 0;
  state.portfolio.forEach(h => {
    const newSym = normaliseSymbol(h.symbol, h.type);
    if (newSym !== h.symbol) {
      if (!silent) console.log(`[auto-normalize] ${h.symbol} → ${newSym}`);
      h.symbol = newSym;
      h.currentPrice = null; // force re-fetch with corrected ticker
      h.dayChange = null;
      h.dayChangePct = null;
      changed++;
    }
  });
  if (changed > 0) {
    if (!silent) console.warn(`[auto-normalize] ${changed} ticker(s) auto-corrected on load`);
    // Heal collisions caused by the rename (e.g. BTC + existing BTC-USD)
    healDuplicates(silent);
    // Persist correction back to localStorage + cloud so it sticks
    try { saveState(); } catch(e) {}
  }
  return changed > 0;
}

function healDuplicates(silent = false) {
  if (!state.portfolio?.length) return 0;
  const seen = new Map();
  let healed = 0;
  let lotsRemoved = 0;
  const issues = [];

  // ─── Pass 1: merge duplicate holdings ───
  for (const h of state.portfolio) {
    const key = `${(h.symbol||'').toUpperCase().trim()}::${(h.platform||'').toLowerCase().trim()}`;
    if (!key || key === '::') continue;
    if (!seen.has(key)) { seen.set(key, h); continue; }
    const prev = seen.get(key);
    const existingSigs = new Set(
      (prev.lots || []).map(l =>
        `${l.date||''}::${(+l.quantity||0).toFixed(6)}::${(+l.price||0).toFixed(6)}`
      )
    );
    const newLots = (h.lots || []).filter(l => {
      const sig = `${l.date||''}::${(+l.quantity||0).toFixed(6)}::${(+l.price||0).toFixed(6)}`;
      return !existingSigs.has(sig);
    });
    const droppedLots = (h.lots || []).length - newLots.length;
    if (newLots.length) prev.lots = [...(prev.lots||[]), ...newLots];
    healed++;
    issues.push(`${key}: duplicate row merged (${newLots.length} new lot(s) kept, ${droppedLots} exact duplicate(s) dropped)`);
  }

  // ─── Pass 2: within each holding, collapse near-duplicate lots ───
  // Same (quantity rounded) + same (price rounded) → keep only the most
  // recent lot. Catches pre-fix cloud state where every import added a new
  // "sync adjustment" lot with today's date.
  const SEVEN_DAYS_MS = 7*24*60*60*1000;
  for (const h of seen.values()) {
    if (!h.lots || h.lots.length < 2) continue;
    // Group lots by (qty, price) signature — date excluded so near-dupes cluster
    const groups = new Map();
    for (const lot of h.lots) {
      const qty = (+lot.quantity || 0).toFixed(4);
      const price = (+lot.price || 0).toFixed(4);
      const g = `${qty}::${price}`;
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(lot);
    }
    const cleanedLots = [];
    let removedHere = 0;
    for (const [g, lots] of groups.entries()) {
      if (lots.length === 1) { cleanedLots.push(lots[0]); continue; }
      // Multiple lots with identical qty+price → probably pre-fix duplicates.
      // Keep the newest one only.
      lots.sort((a,b) => (b.date||'').localeCompare(a.date||''));
      cleanedLots.push(lots[0]);
      removedHere += lots.length - 1;
      const key = `${(h.symbol||'').toUpperCase()}::${(h.platform||'').toLowerCase()}`;
      issues.push(`${key}: collapsed ${lots.length} near-duplicate lots (qty=${lots[0].quantity}, price=${lots[0].price}) → kept newest (${lots[0].date})`);
    }
    if (removedHere > 0) {
      h.lots = cleanedLots;
      lotsRemoved += removedHere;
    }
  }

  if (healed > 0 || lotsRemoved > 0) {
    state.portfolio = [...seen.values()];
    if (!silent) {
      console.warn(`[self-heal] 🩹 Fixed ${healed} duplicate holding${healed!==1?'s':''} + collapsed ${lotsRemoved} near-duplicate lot${lotsRemoved!==1?'s':''}:\n  • ${issues.join('\n  • ')}`);
    }
    try { saveState(); } catch(e) {}
  }
  return healed + lotsRemoved;
}

// saveState moved to js/20-state.js

// CSV import, eToro loader, parseCSVLine, normaliseSymbol, CRYPTO_ALIAS, downloadCSVTemplate moved to js/60-import.js

// ===== HELPERS =====
// uuid, fmt, fmtCurrency, fmtChange, getTagClass moved to js/10-helpers.js

// ===== FX CONVERSION =====
function getFxRate(fromCurrency, toCurrency) {
  if (!fromCurrency || fromCurrency === toCurrency) return 1;
  const fx = state.marketData?.fx || {};
  // Direct: e.g. USD/NZD
  const direct = `${fromCurrency}/${toCurrency}`;
  if (fx[direct]?.price) return fx[direct].price;
  // Inverse: e.g. NZD/USD → 1/rate
  const inverse = `${toCurrency}/${fromCurrency}`;
  if (fx[inverse]?.price) return 1 / fx[inverse].price;
  // Via USD if neither is USD
  if (fromCurrency !== 'USD' && toCurrency !== 'USD') {
    const toUSD = getFxRate(fromCurrency, 'USD');
    const usdToTarget = getFxRate('USD', toCurrency);
    if (toUSD && usdToTarget) return toUSD * usdToTarget;
  }
  return 1;
}

// ===== LOTS / WEIGHTED AVERAGE COST BASIS =====
function getHoldingBasis(h) {
  // Migrate legacy single-price holdings to lots format on the fly
  const lots = (h.lots && h.lots.length)
    ? h.lots
    : [{ quantity: parseFloat(h.quantity) || 0, price: parseFloat(h.purchasePrice) || 0, date: h.purchaseDate || '' }];
  const totalQty  = lots.reduce((s, l) => s + (parseFloat(l.quantity) || 0), 0);
  const totalCost = lots.reduce((s, l) => s + (parseFloat(l.quantity) || 0) * (parseFloat(l.price) || 0), 0);
  return {
    lots,
    quantity:    totalQty,
    avgBuyPrice: totalQty > 0 ? totalCost / totalQty : 0,
    totalCost
  };
}

// ===== PORTFOLIO CALCULATIONS =====
// London Stock Exchange tickers (AZN.L, CPI.L, etc) are quoted by Yahoo in PENCE
// not pounds, so a raw × GBP/NZD rate gives a number 100× too big.
// Detect LSE symbols and convert pence → pounds before FX.
function isPenceQuoted(symbol) {
  if (!symbol) return false;
  const upper = symbol.toUpperCase();
  return upper.endsWith('.L') || upper.endsWith('.IL');
}

function getMetrics() {
  const base = state.settings.currency || 'NZD';
  const holdings = state.portfolio.map(h => {
    const basis = getHoldingBasis(h);
    // LSE stocks quoted in pence — divide by 100 to get pounds before FX
    const penceAdj = isPenceQuoted(h.symbol) ? 0.01 : 1;
    const fx = getFxRate(h.currency || 'USD', base) * penceAdj;
    const currentPrice = (h.currentPrice ?? basis.avgBuyPrice) * fx;
    const avgBuyPrice  = basis.avgBuyPrice * fx;
    const quantity     = basis.quantity;
    const currentValue = quantity * currentPrice;
    const costBasis    = quantity * avgBuyPrice;
    const gain         = currentValue - costBasis;
    const gainPct      = costBasis > 0 ? (gain / costBasis) * 100 : 0;
    const dayChange    = h.dayChange ? quantity * h.dayChange * fx : null;
    return {
      ...h,
      quantity, avgBuyPrice, buyPrice: avgBuyPrice, currentPrice,
      currentValue, costBasis, gain, gainPct, dayChange,
      fxRate: fx, lots: basis.lots,
      ignored: !!h.ignored
    };
  });

  // Exclude ignored holdings from portfolio totals (but still return them
  // so they remain visible in the Holdings table, just dimmed).
  const active = holdings.filter(h => !h.ignored);
  const totalValue = active.reduce((s,h) => s + h.currentValue, 0);
  const totalCost  = active.reduce((s,h) => s + h.costBasis, 0);
  const totalGain  = totalValue - totalCost;
  const totalGainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;
  const totalDayChange = active.reduce((s,h) => s + (h.dayChange||0), 0);
  const ignoredValue   = holdings.filter(h => h.ignored).reduce((s,h) => s + h.currentValue, 0);

  // Weight is calculated against ACTIVE value (not including ignored)
  holdings.forEach(h => {
    h.weight = (!h.ignored && totalValue > 0) ? (h.currentValue / totalValue) * 100 : 0;
  });

  return { holdings, totalValue, totalCost, totalGain, totalGainPct, totalDayChange, ignoredValue, ignoredCount: holdings.length - active.length };
}

function calcDiversificationScore(metrics) {
  if (!metrics.holdings.length) return null;
  const types = [...new Set(metrics.holdings.map(h => h.type))].length;
  const platforms = [...new Set(metrics.holdings.map(h => h.platform))].length;
  const sectors = [...new Set(metrics.holdings.filter(h=>h.sector).map(h => h.sector))].length;
  const maxWeight = Math.max(...metrics.holdings.map(h => h.weight));
  const n = metrics.holdings.length;

  let score = 0;
  score += Math.min(types * 12, 30);
  score += Math.min(platforms * 8, 20);
  score += Math.min(sectors * 6, 24);
  score += Math.min(n * 3, 15);
  score += maxWeight < 20 ? 11 : maxWeight < 40 ? 6 : 0;

  return Math.min(Math.round(score), 100);
}

// ===== MARKET DATA FETCHING =====
const MARKET_SYMBOLS = {
  indices: { 'S&P 500':'^GSPC', 'NASDAQ':'^IXIC', 'FTSE 100':'^FTSE', 'Nikkei 225':'^N225', 'DAX':'^GDAXI', 'NZX 50':'^NZ50' },
  commodities: { 'Gold':'GC=F', 'Silver':'SI=F', 'Crude Oil':'CL=F', 'Natural Gas':'NG=F' },
  crypto: { 'Bitcoin':'BTC-USD', 'Ethereum':'ETH-USD', 'BNB':'BNB-USD' },
  fx: { 'USD/NZD':'USDNZD=X', 'AUD/NZD':'AUDNZD=X', 'GBP/NZD':'GBPNZD=X', 'USD/AUD':'USDAUD=X' }
};

async function fetchYahooQuotes(symbols) {
  // Try local proxy first (most reliable, no CORS issues)
  const localProxy = (state.settings.proxyUrl || 'http://localhost:8080').replace(/\/$/, '');
  try {
    const res = await fetch(`${localProxy}/api/market?symbols=${encodeURIComponent(symbols.join(','))}`, { headers: proxyHeaders(), signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const data = await res.json();
      // Proxy returns {sym: {price, change, changePct, name}}
      if (Object.keys(data).length > 0) return data;
    }
  } catch(e) { /* fall through to public proxies */ }

  // Fall back to public CORS proxies
  const joined = symbols.join(',');
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(joined)}&fields=regularMarketPrice,regularMarketChangePercent,regularMarketChange,longName,shortName`;
  for (const proxy of CORS_PROXIES) {
    try {
      const res = await fetch(proxy + encodeURIComponent(url), { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const data = await res.json();
      const results = data.quoteResponse?.result || [];
      const map = {};
      results.forEach(q => {
        map[q.symbol] = {
          price: q.regularMarketPrice,
          change: q.regularMarketChange,
          changePct: q.regularMarketChangePercent,
          name: q.longName || q.shortName || q.symbol
        };
      });
      return map;
    } catch(e) { continue; }
  }
  return {};
}

async function refreshMarketData() {
  const localProxy = (state.settings.proxyUrl || 'http://localhost:8080').replace(/\/$/, '');
  try {
    const res = await fetch(`${localProxy}/api/market`, { headers: proxyHeaders(), signal: AbortSignal.timeout(10000) });
    if (res.ok) {
      const data = await res.json();
      if (data.indices) {
        state.marketData = { indices: data.indices || {}, commodities: data.commodities || {}, crypto: data.crypto || {}, fx: data.fx || {} };
        renderMarketSection();
        renderAll();
        updateTicker();
        return;
      }
    }
  } catch(e) { /* fall through */ }

  // Fall back to direct Yahoo Finance via CORS proxies
  try {
    const allSymbols = [
      ...Object.values(MARKET_SYMBOLS.indices),
      ...Object.values(MARKET_SYMBOLS.commodities),
      ...Object.values(MARKET_SYMBOLS.crypto),
      ...Object.values(MARKET_SYMBOLS.fx)
    ];
    const quotes = await fetchYahooQuotes(allSymbols);
    ['indices','commodities','crypto','fx'].forEach(cat => {
      Object.entries(MARKET_SYMBOLS[cat]).forEach(([name, sym]) => {
        if (quotes[sym]) state.marketData[cat][name] = quotes[sym];
      });
    });
    renderMarketSection();
    renderAll();
    updateTicker();
  } catch(e) {
    console.warn('Market data fetch failed:', e);
  }
}

async function refreshPortfolioAndPrices() {
  // Refresh portfolio prices AND market data together so FX rates are available
  await refreshMarketData();
  await refreshPortfolioPrices();
  renderAll();
  updateTicker();
}

async function refreshPortfolioPrices() {
  const symbols = state.portfolio.filter(h => h.symbol && h.type !== 'cash').map(h => h.symbol);
  if (!symbols.length) return;
  try {
    const quotes = await fetchYahooQuotes([...new Set(symbols)]);
    state.portfolio.forEach(h => {
      const q = quotes[h.symbol];
      if (q) {
        h.currentPrice = q.price;
        h.dayChange = q.change;
        h.dayChangePct = q.changePct;
        if (q.name && q.name !== h.symbol) h.name = q.name;
      }
    });
    saveState();
    renderAll();
    updatePortfolioTicker();
  } catch(e) {
    console.warn('Price refresh failed:', e);
  }
}
