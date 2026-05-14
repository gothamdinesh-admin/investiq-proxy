// ═══════════════════════════════════════════════════════════════════════
// 30-cloud.js — Supabase init, cloud load/save, debounced sync.
// Depends on: 00-config.js (LOCAL_ONLY_SETTINGS), 20-state.js (state).
// Forward refs (resolved lazily at call time, defined in inline <script>):
//   consolidatePortfolio(), updateSyncIndicator()
// ═══════════════════════════════════════════════════════════════════════

let _supabase = null;
let _supaUser  = null;
let _savePending = null;

function initSupabase() {
  const url = state.settings.supabaseUrl?.trim();
  const key = state.settings.supabaseKey?.trim();
  if (!url || !key) { _supabase = null; return false; }
  if (!window.supabase?.createClient) {
    console.warn('Supabase library not loaded yet');
    _supabase = null;
    return false;
  }
  try {
    _supabase = window.supabase.createClient(url, key);
    return true;
  } catch(e) {
    console.warn('Supabase init failed:', e);
    _supabase = null;
    return false;
  }
}

async function loadFromSupabase() {
  if (!_supabase || !_supaUser) return false;
  try {
    const { data, error } = await _supabase
      .from('investiq_portfolios')
      .select('portfolio, settings, agent_results, updated_at')
      .eq('user_id', _supaUser.id)
      .single();
    if (error && error.code !== 'PGRST116') { console.warn('Supabase load:', error.message); return false; }
    if (!data) return false;

    // DIAGNOSTIC: log cloud portfolio structure so we can spot duplication at source
    const cloudPortfolio = data.portfolio || [];
    const keyCounts = {};
    cloudPortfolio.forEach(h => {
      const k = `${(h.symbol||'').toUpperCase()}::${(h.platform||'').toLowerCase()}`;
      keyCounts[k] = (keyCounts[k] || 0) + 1;
    });
    const dupKeys = Object.entries(keyCounts).filter(([,c]) => c > 1);
    console.log(`[supabase-load] cloud has ${cloudPortfolio.length} rows, ${Object.keys(keyCounts).length} unique keys, updated_at=${data.updated_at}`);
    if (dupKeys.length) {
      console.error('[supabase-load] 🚨 CLOUD HAS DUPLICATE KEYS:', dupKeys);
      console.error('[supabase-load] This is the source of doubling. Dumping full cloud portfolio:', cloudPortfolio);
    }
    // Also check total quantity per unique key to detect lot-based doubling
    const qtyPerKey = {};
    cloudPortfolio.forEach(h => {
      const k = `${(h.symbol||'').toUpperCase()}::${(h.platform||'').toLowerCase()}`;
      const qty = (h.lots||[]).reduce((s,l) => s + (parseFloat(l.quantity)||0), 0)
                 || parseFloat(h.quantity) || 0;
      qtyPerKey[k] = (qtyPerKey[k] || 0) + qty;
    });
    const lotCountPerKey = {};
    cloudPortfolio.forEach(h => {
      const k = `${(h.symbol||'').toUpperCase()}::${(h.platform||'').toLowerCase()}`;
      lotCountPerKey[k] = (lotCountPerKey[k] || 0) + (h.lots||[]).length;
    });
    const fatKeys = Object.entries(lotCountPerKey).filter(([,c]) => c > 3);
    if (fatKeys.length) {
      console.warn('[supabase-load] ⚠ keys with >3 lots (suspicious):', fatKeys);
    }

    // ─── Cache/staleness guard ─────────────────────────────────
    // If local state is NEWER than Supabase, skip the overwrite — local wins.
    // Prevents "just-imported CSV reverted by stale cloud data" bug.
    const localUpdatedAt  = state.settings?.updatedAt || localStorage.getItem('investiq_updated_at') || null;
    const remoteUpdatedAt = data.updated_at || null;
    const localPortfolioLen  = state.portfolio?.length || 0;
    const remotePortfolioLen = (data.portfolio || []).length;

    if (localUpdatedAt && remoteUpdatedAt && new Date(localUpdatedAt) > new Date(remoteUpdatedAt)) {
      console.log(`[supabase-load] SKIPPED — local state (${localUpdatedAt}, ${localPortfolioLen} holdings) is newer than cloud (${remoteUpdatedAt}, ${remotePortfolioLen}). Pushing local to cloud instead.`);
      saveToSupabase();
      return false;
    }
    // Also skip if local has holdings but cloud is empty — cloud almost certainly hasn't synced yet
    if (localPortfolioLen > 0 && remotePortfolioLen === 0) {
      console.log(`[supabase-load] SKIPPED — local has ${localPortfolioLen} holdings, cloud has 0. Pushing local up instead.`);
      saveToSupabase();
      return false;
    }

    // Snapshot LOCAL credentials first, then merge remote, then restore locals on top
    const localOnly = {};
    LOCAL_ONLY_SETTINGS.forEach(k => { if (state.settings[k]) localOnly[k] = state.settings[k]; });

    const remoteSettings = data.settings || {};
    state.settings = { ...state.settings, ...remoteSettings, ...localOnly };
    if (remoteUpdatedAt) state.settings.updatedAt = remoteUpdatedAt;

    state.portfolio = consolidatePortfolio(data.portfolio || []);
    if (data.agent_results) state.agentResults = data.agent_results;
    localStorage.setItem('investiq_v2', JSON.stringify({ portfolio: state.portfolio, settings: state.settings, agentResults: state.agentResults }));
    if (remoteUpdatedAt) localStorage.setItem('investiq_updated_at', remoteUpdatedAt);
    console.log(`✓ Loaded from Supabase (${remotePortfolioLen} holdings, updated ${remoteUpdatedAt})`);
    return true;
  } catch(e) { console.warn('Supabase load error:', e); return false; }
}

async function saveToSupabase() {
  if (!_supabase || !_supaUser) return;
  try {
    // Strip ALL local-only credentials before writing to cloud
    const settingsToSave = { ...state.settings };
    LOCAL_ONLY_SETTINGS.forEach(k => delete settingsToSave[k]);

    // DEFENSIVE DEDUPE — never write duplicate keys to cloud.
    // This kills the "doubled on next load" bug at its source, even if some
    // other code path accidentally produced duplicates in state.portfolio.
    const seen = new Map();
    state.portfolio.forEach(h => {
      const key = `${(h.symbol||'').toUpperCase().trim()}::${(h.platform||'').toLowerCase().trim()}`;
      if (!seen.has(key)) {
        seen.set(key, h);
      } else {
        const prev = seen.get(key);
        // Keep the one with the newer date on any lot, or just the first
        const prevMaxDate = (prev.lots||[]).reduce((m,l) => l.date > m ? l.date : m, '');
        const curMaxDate  = (h.lots||[]).reduce((m,l) => l.date > m ? l.date : m, '');
        if (curMaxDate > prevMaxDate) seen.set(key, h);
        console.warn(`[saveToSupabase] duplicate key "${key}" in state.portfolio — keeping one, discarding other`);
      }
    });
    const dedupedPortfolio = [...seen.values()];
    if (dedupedPortfolio.length !== state.portfolio.length) {
      console.error(`[saveToSupabase] ⚠ state.portfolio had ${state.portfolio.length} entries but ${dedupedPortfolio.length} unique keys — dedup applied before cloud write`);
      state.portfolio = dedupedPortfolio; // fix local state too
    }

    const nowIso = new Date().toISOString();
    const { error } = await _supabase
      .from('investiq_portfolios')
      .upsert({
        user_id: _supaUser.id,
        portfolio: dedupedPortfolio,
        settings: settingsToSave,
        agent_results: state.agentResults,
        updated_at: nowIso
      }, { onConflict: 'user_id' });
    if (error) {
      console.warn('Supabase save:', error.message);
    } else {
      state.settings.updatedAt = nowIso;
      localStorage.setItem('investiq_updated_at', nowIso);
      console.log(`✓ Saved to Supabase (${dedupedPortfolio.length} unique holdings, ${nowIso})`);
      updateSyncIndicator();
    }
  } catch(e) { console.warn('Supabase save error:', e); }
}

function scheduleSupa() {
  // Debounce: save to Supabase 2s after the last state change
  if (_savePending) clearTimeout(_savePending);
  _savePending = setTimeout(() => saveToSupabase(), 2000);
}
