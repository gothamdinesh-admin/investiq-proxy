// ═══════════════════════════════════════════════════════════════════════
// 20-state.js — Global app state + localStorage persistence.
// Depends on: 00-config.js (PLATFORM_CONFIG, LOCAL_ONLY_SETTINGS).
// Forward refs (resolved at call time, declared in inline <script>):
//   consolidatePortfolio(), scheduleSupa()
// ═══════════════════════════════════════════════════════════════════════

let state = {
  portfolio: [],
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

// Fill any empty platform creds with PLATFORM_CONFIG defaults.
// Admin overrides (stored in localStorage) persist. New users get platform defaults.
function applyPlatformDefaults() {
  if (!state.settings.proxyUrl    && PLATFORM_CONFIG.proxyUrl)    state.settings.proxyUrl    = PLATFORM_CONFIG.proxyUrl;
  if (!state.settings.supabaseUrl && PLATFORM_CONFIG.supabaseUrl) state.settings.supabaseUrl = PLATFORM_CONFIG.supabaseUrl;
  if (!state.settings.supabaseKey && PLATFORM_CONFIG.supabaseKey) state.settings.supabaseKey = PLATFORM_CONFIG.supabaseKey;
}

function loadState() {
  try {
    const s = localStorage.getItem('investiq_v2');
    if (s) {
      const parsed = JSON.parse(s);
      // Migrate legacy holdings (no lots) to lots format
      state.portfolio = consolidatePortfolio(parsed.portfolio || []);
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
  const portfolio = consolidatePortfolio(state.portfolio);
  localStorage.setItem('investiq_v2', JSON.stringify({
    portfolio,
    settings: safeSetting,
    agentResults: state.agentResults,
    // Persist FX rates only (small, deterministic). Indices/crypto/commodities
    // are re-fetched anyway and would just bloat the payload.
    marketData: { fx: state.marketData?.fx || {} }
  }));
  // Layer 1 data-safety — keep a rolling local backup of the LAST GOOD
  // (non-empty) portfolio in a SEPARATE key. Survives a corrupt/zeroed
  // investiq_v2. Never overwrites the backup with an empty portfolio.
  _pushAutoBackup(portfolio);
  scheduleSupa(); // sync to cloud if signed in
}

// Rolling local auto-backup. Keeps the last 3 non-empty portfolio
// snapshots in localStorage key 'investiq_autobackup'. Skips empty
// portfolios entirely so a wipe can never clobber the last good copy.
// Skips churn: only adds a new entry when the holdings count changed or
// >6h since the last backup.
function _pushAutoBackup(portfolio) {
  try {
    if (!Array.isArray(portfolio) || portfolio.length === 0) return; // never back up empty
    const KEY = 'investiq_autobackup';
    let backups = [];
    try { backups = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch(e) { backups = []; }
    const now = Date.now();
    const last = backups[0];
    const sameCount = last && last.count === portfolio.length;
    const recent = last && (now - (last.ts || 0)) < 6 * 3600 * 1000;
    if (sameCount && recent) return; // avoid churn
    backups.unshift({
      at: new Date().toISOString(),
      ts: now,
      count: portfolio.length,
      portfolio
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

// Restore the portfolio from the most recent (or a specific) local
// auto-backup. Returns the restored count, or 0 if none.
function restoreFromAutoBackup(index = 0) {
  const backups = listAutoBackups();
  const b = backups[index];
  if (!b || !Array.isArray(b.portfolio) || !b.portfolio.length) return 0;
  state.portfolio = consolidatePortfolio(b.portfolio);
  saveState();
  return state.portfolio.length;
}
