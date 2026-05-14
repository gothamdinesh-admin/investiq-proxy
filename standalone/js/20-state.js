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
  localStorage.setItem('investiq_v2', JSON.stringify({
    portfolio: consolidatePortfolio(state.portfolio),
    settings: safeSetting,
    agentResults: state.agentResults,
    // Persist FX rates only (small, deterministic). Indices/crypto/commodities
    // are re-fetched anyway and would just bloat the payload.
    marketData: { fx: state.marketData?.fx || {} }
  }));
  scheduleSupa(); // sync to cloud if signed in
}
