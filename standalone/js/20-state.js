// ═══════════════════════════════════════════════════════════════════════
// 20-state.js — Global app state + localStorage persistence.
// Depends on: 00-config.js (PLATFORM_CONFIG, LOCAL_ONLY_SETTINGS),
//             10-helpers.js (uuid).
// Forward refs (resolved at call time, declared in inline <script>):
//   consolidatePortfolio(), scheduleSupa()
//
// ─── MULTI-PORTFOLIO MODEL (v0.21) ──────────────────────────────────────
// state.portfolios = [{ id, name, holdings:[...] }]  ← the container
// state.activePortfolioId = '<id>'                    ← which one is active
// state.portfolio          ← ACCESSOR: mirrors the active portfolio's
//                            holdings. Every legacy reference to
//                            state.portfolio transparently reads/writes the
//                            ACTIVE portfolio, so no section code changed.
// ═══════════════════════════════════════════════════════════════════════

let state = {
  portfolios: [{ id: 'default', name: 'Personal', holdings: [] }],
  activePortfolioId: 'default',
  // Transient "All portfolios (combined)" view flag. NEVER persisted — a
  // reload always returns to a real, editable portfolio. When true, the
  // state.portfolio accessor returns a READ-ONLY flattened view across all
  // portfolios and BLOCKS writes, so combined view can't mutate data.
  _viewAllPortfolios: false,
  settings: {
    name: 'My Portfolio', currency: 'NZD',
    claudeApiKey: '',
    // Platform creds default to PLATFORM_CONFIG — user/admin can override
    proxyUrl:    PLATFORM_CONFIG.proxyUrl,
    supabaseUrl: PLATFORM_CONFIG.supabaseUrl,
    supabaseKey: PLATFORM_CONFIG.supabaseKey
  },
  marketData: { indices:{}, fx:{}, crypto:{}, commodities:{} },
  agentResults: null,
  allocMode: 'type',
  perfMode: 'value'
};

// ─── state.portfolio accessor ────────────────────────────────────────────
// Reads/writes the ACTIVE portfolio's holdings array. This is the bridge
// that lets ~111 existing `state.portfolio` references keep working while
// the real data now lives in state.portfolios[]. Enumerable so existing
// spread/serialise behaviour is preserved.
Object.defineProperty(state, 'portfolio', {
  get() {
    // Combined view: READ-ONLY flattened holdings across all portfolios,
    // each tagged with _portfolioName (shallow copies — never the originals).
    if (this._viewAllPortfolios) {
      const out = [];
      (this.portfolios || []).forEach(p =>
        (p.holdings || []).forEach(h => out.push({ ...h, _portfolioName: p.name })));
      return out;
    }
    const p = this.portfolios.find(x => x.id === this.activePortfolioId)
            || this.portfolios[0];
    return p ? p.holdings : [];
  },
  set(v) {
    // Combined view is read-only — silently ignore writes so nothing can
    // corrupt the underlying portfolios while viewing the merged total.
    if (this._viewAllPortfolios) return;
    let p = this.portfolios.find(x => x.id === this.activePortfolioId)
          || this.portfolios[0];
    if (!p) { p = { id: 'default', name: 'Personal', holdings: [] }; this.portfolios = [p]; this.activePortfolioId = p.id; }
    p.holdings = Array.isArray(v) ? v : [];
  },
  enumerable: true,
  configurable: true
});

// ─── Multi-portfolio management API (called by the header switcher UI) ────

// Always returns a valid active portfolio object (self-heals if missing).
function getActivePortfolio() {
  if (!Array.isArray(state.portfolios) || state.portfolios.length === 0) {
    state.portfolios = [{ id: 'default', name: 'Personal', holdings: [] }];
    state.activePortfolioId = 'default';
  }
  let p = state.portfolios.find(x => x.id === state.activePortfolioId);
  if (!p) { p = state.portfolios[0]; state.activePortfolioId = p.id; }
  return p;
}

function listPortfolios() {
  return Array.isArray(state.portfolios) ? state.portfolios : [];
}

// Switch the active portfolio. Also exits combined view. Returns true if
// anything changed (active id changed OR we left combined view) so the
// caller knows to repaint.
function setActivePortfolio(id) {
  if (!state.portfolios.some(x => x.id === id)) return false;
  const wasViewingAll = state._viewAllPortfolios;
  state._viewAllPortfolios = false;
  if (state.activePortfolioId === id && !wasViewingAll) return false;
  state.activePortfolioId = id;
  saveState();
  return true;
}

// Enter / leave the read-only "All portfolios (combined)" view.
function setViewAllPortfolios(on) {
  state._viewAllPortfolios = !!on && listPortfolios().length > 1;
  // Not persisted — purely a view toggle. No saveState() needed.
}
function isViewingAll() { return !!state._viewAllPortfolios; }

// Create a new (empty) portfolio and make it active. Exits combined view.
function createPortfolio(name) {
  const clean = (name || '').trim() || `Portfolio ${state.portfolios.length + 1}`;
  const id = uuid();
  state._viewAllPortfolios = false;
  state.portfolios.push({ id, name: clean, holdings: [] });
  state.activePortfolioId = id;
  saveState();
  return id;
}

// Rename a portfolio. Returns true on success.
function renamePortfolio(id, name) {
  const p = state.portfolios.find(x => x.id === id);
  const clean = (name || '').trim();
  if (!p || !clean) return false;
  p.name = clean;
  saveState();
  return true;
}

// Delete a portfolio. Refuses to delete the last one. If the active
// portfolio is deleted, falls back to the first remaining. Returns true
// on success.
function deletePortfolio(id) {
  if (state.portfolios.length <= 1) return false; // never zero portfolios
  const idx = state.portfolios.findIndex(x => x.id === id);
  if (idx === -1) return false;
  state.portfolios.splice(idx, 1);
  if (state.activePortfolioId === id) {
    state.activePortfolioId = state.portfolios[0].id;
  }
  saveState();
  return true;
}

// Total holdings across ALL portfolios — used by the empty-save guard so
// an empty ACTIVE portfolio (legitimate) doesn't look like data loss.
function totalHoldingsCount() {
  return listPortfolios().reduce((s, p) => s + (p.holdings?.length || 0), 0);
}

// Fill any empty platform creds with PLATFORM_CONFIG defaults.
// Admin overrides (stored in localStorage) persist. New users get platform defaults.
function applyPlatformDefaults() {
  if (!state.settings.proxyUrl    && PLATFORM_CONFIG.proxyUrl)    state.settings.proxyUrl    = PLATFORM_CONFIG.proxyUrl;
  if (!state.settings.supabaseUrl && PLATFORM_CONFIG.supabaseUrl) state.settings.supabaseUrl = PLATFORM_CONFIG.supabaseUrl;
  if (!state.settings.supabaseKey && PLATFORM_CONFIG.supabaseKey) state.settings.supabaseKey = PLATFORM_CONFIG.supabaseKey;
  // v0.31.2 — NON-PERSONAL EDITIONS ALWAYS OWN THEIR SUPABASE TARGET.
  // supabaseUrl/Key are LOCAL_ONLY_SETTINGS persisted in same-origin
  // localStorage, so on a shared domain a ?edition=harbour preview silently
  // inherited the PERSONAL project's creds (stored values are never empty on
  // a machine that has used the personal app) → signups hit the personal DB
  // and its confirm-email policy. Force the edition's own project here.
  if (typeof EDITION !== 'undefined' && EDITION.id !== 'personal') {
    state.settings.supabaseUrl = EDITION.supabaseUrl;
    state.settings.supabaseKey = EDITION.supabaseKey;
  }
}

// Normalise whatever was loaded (legacy single-portfolio OR new
// multi-portfolio shape) into the canonical state.portfolios[] structure.
// LEGACY MIGRATION: {portfolio:[...]} → {portfolios:[{name:'Personal', holdings:[...]}]}.
// Pure additive wrap — no holding can be lost.
function _normalisePortfolios(parsed) {
  // New shape — already has portfolios[]
  if (Array.isArray(parsed.portfolios) && parsed.portfolios.length) {
    state.portfolios = parsed.portfolios.map(p => ({
      id: p.id || uuid(),
      name: (p.name || 'Portfolio').trim() || 'Portfolio',
      holdings: consolidatePortfolio(p.holdings || []),
      // Fund metadata (Disclose imports: name/asAt/asAtISO) must survive
      // normalisation — dropping it silently broke the fund view on reload.
      ...(p.fund ? { fund: p.fund } : {})
    }));
    const wanted = parsed.activePortfolioId;
    state.activePortfolioId = state.portfolios.some(p => p.id === wanted)
      ? wanted : state.portfolios[0].id;
    return;
  }
  // Legacy shape — single portfolio array → wrap into "Personal"
  const legacy = consolidatePortfolio(parsed.portfolio || []);
  const id = 'default';
  state.portfolios = [{ id, name: 'Personal', holdings: legacy }];
  state.activePortfolioId = id;
}

function loadState() {
  try {
    const s = localStorage.getItem('investiq_v2');
    if (s) {
      const parsed = JSON.parse(s);
      _normalisePortfolios(parsed);
      state.settings = { ...state.settings, ...(parsed.settings||{}) };
      state.agentResults = parsed.agentResults || null;
      // Restore last-known FX rates so the first render after reload converts
      // currencies correctly. Without this, USD/GBP holdings render at raw
      // foreign-currency numbers (fx=1 fallback) and the displayed total flicks
      // upward by ~70% once refreshMarketData() finishes ~2s later. Keeping
      // stale rates is far better than a wildly-wrong initial render — Yahoo
      // intraday FX moves are fractions of a percent.
      if (parsed.marketData?.fx) state.marketData.fx = parsed.marketData.fx;
    }
    applyPlatformDefaults();
  } catch(e) { console.warn('Failed to load state:', e); }
}

function saveState() {
  // claudeApiKey is never needed in the browser — the Render proxy holds it server-side.
  // All other settings (proxyUrl, supabaseUrl/Key, akahuTokens) are safe to persist:
  //   • proxyUrl / supabaseUrl / supabaseKey are platform-level, non-secret config
  //   • akahuTokens are per-user and must persist so users don't re-enter them
  const safeSetting = { ...state.settings, claudeApiKey: '' };
  // Consolidate every portfolio's holdings before persisting. IMPORTANT:
  // carry fund metadata (Disclose imports) through the rebuild — this map
  // runs on EVERY save, so dropping the key here silently killed the fund
  // view (as-at badge, unit-price/returns matching) moments after import.
  const portfolios = listPortfolios().map(p => ({
    id: p.id,
    name: p.name,
    holdings: consolidatePortfolio(p.holdings || []),
    ...(p.fund ? { fund: p.fund } : {})
  }));
  if (portfolios.length === 0) portfolios.push({ id: 'default', name: 'Personal', holdings: [] });
  const activePortfolioId = portfolios.some(p => p.id === state.activePortfolioId)
    ? state.activePortfolioId : portfolios[0].id;
  // Keep state.portfolios reference in sync with the consolidated copy.
  state.portfolios = portfolios;
  state.activePortfolioId = activePortfolioId;

  localStorage.setItem('investiq_v2', JSON.stringify({
    // Persist BOTH shapes: the new portfolios[] (source of truth) AND a
    // top-level `portfolio` = active holdings, so any code/tool that still
    // reads the legacy key keeps working during the transition.
    portfolios,
    activePortfolioId,
    portfolio: (portfolios.find(p => p.id === activePortfolioId) || portfolios[0]).holdings,
    settings: safeSetting,
    agentResults: state.agentResults,
    // Persist FX rates only (small, deterministic). Indices/crypto/commodities
    // are re-fetched anyway and would just bloat the payload.
    marketData: { fx: state.marketData?.fx || {} }
  }));
  // Layer 1 data-safety — keep a rolling local backup of the LAST GOOD
  // (non-empty) ENVELOPE in a SEPARATE key. Survives a corrupt/zeroed
  // investiq_v2. Never overwrites the backup with an all-empty state.
  _pushAutoBackup({ portfolios, activePortfolioId });
  scheduleSupa(); // sync to cloud if signed in
}

// Rolling local auto-backup. Keeps the last 3 non-empty ENVELOPE
// snapshots in localStorage key 'investiq_autobackup'. Skips states with
// zero total holdings entirely so a wipe can never clobber the last good
// copy. Skips churn: only adds when the total holdings count changed or
// >6h since the last backup.
function _pushAutoBackup(envelope) {
  try {
    const portfolios = envelope?.portfolios || [];
    const total = portfolios.reduce((s, p) => s + (p.holdings?.length || 0), 0);
    if (total === 0) return; // never back up an all-empty state
    const KEY = 'investiq_autobackup';
    let backups = [];
    try { backups = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch(e) { backups = []; }
    const now = Date.now();
    const last = backups[0];
    const sameCount = last && last.count === total;
    const recent = last && (now - (last.ts || 0)) < 6 * 3600 * 1000;
    if (sameCount && recent) return; // avoid churn
    backups.unshift({
      at: new Date().toISOString(),
      ts: now,
      count: total,
      portfolios,
      activePortfolioId: envelope.activePortfolioId,
      // Back-compat: also store the active holdings under `portfolio` so an
      // older build's restore (which reads `.portfolio`) still works.
      portfolio: (portfolios.find(p => p.id === envelope.activePortfolioId) || portfolios[0])?.holdings || []
    });
    backups = backups.slice(0, 3); // keep last 3
    try {
      localStorage.setItem(KEY, JSON.stringify(backups));
    } catch(e) {
      // localStorage quota — drop to 1 backup and retry, else give up quietly
      try { localStorage.setItem(KEY, JSON.stringify(backups.slice(0, 1))); }
      catch(e2) { console.warn('[autobackup] quota exceeded — skipped'); }
    }
  } catch(e) { console.warn('[autobackup] failed:', e); }
}

// List available local auto-backups (newest first) — for the admin tool.
function listAutoBackups() {
  try { return JSON.parse(localStorage.getItem('investiq_autobackup') || '[]'); }
  catch(e) { return []; }
}

// Restore the WHOLE portfolio envelope from the most recent (or a specific)
// local auto-backup. Handles both new (portfolios[]) and legacy (portfolio[])
// backup shapes. Returns the total restored holdings count, or 0 if none.
function restoreFromAutoBackup(index = 0) {
  const backups = listAutoBackups();
  const b = backups[index];
  if (!b) return 0;
  if (Array.isArray(b.portfolios) && b.portfolios.length) {
    state.portfolios = b.portfolios.map(p => ({
      id: p.id || uuid(),
      name: p.name || 'Portfolio',
      holdings: consolidatePortfolio(p.holdings || []),
      ...(p.fund ? { fund: p.fund } : {})
    }));
    state.activePortfolioId = state.portfolios.some(p => p.id === b.activePortfolioId)
      ? b.activePortfolioId : state.portfolios[0].id;
  } else if (Array.isArray(b.portfolio) && b.portfolio.length) {
    // Legacy single-portfolio backup
    state.portfolios = [{ id: 'default', name: 'Personal', holdings: consolidatePortfolio(b.portfolio) }];
    state.activePortfolioId = 'default';
  } else {
    return 0;
  }
  saveState();
  return totalHoldingsCount();
}
