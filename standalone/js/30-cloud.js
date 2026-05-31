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
    // select('*') so this keeps working whether or not the multi-portfolio
    // columns (portfolios, active_portfolio_id) exist yet (migration 016).
    const { data, error } = await _supabase
      .from('investiq_portfolios')
      .select('*')
      .eq('user_id', _supaUser.id)
      .single();
    if (error && error.code !== 'PGRST116') { console.warn('Supabase load:', error.message); return false; }
    if (!data) return false;

    // ─── Resolve the cloud ENVELOPE (multi-portfolio aware) ───────────────
    // New shape: data.portfolios[]. Legacy shape: data.portfolio (single
    // array) → wrap into "Personal". The legacy `portfolio` column is also
    // kept populated with the active holdings for Edge-Function compat.
    const cloudPortfolios = (Array.isArray(data.portfolios) && data.portfolios.length)
      ? data.portfolios
      : [{ id: 'default', name: 'Personal', holdings: data.portfolio || [] }];
    const cloudActiveId = (data.active_portfolio_id
      && cloudPortfolios.some(p => p.id === data.active_portfolio_id))
      ? data.active_portfolio_id : cloudPortfolios[0].id;

    // DIAGNOSTIC: scan the ACTIVE/legacy holdings to spot duplication at source
    const cloudPortfolio = (cloudPortfolios.find(p => p.id === cloudActiveId) || cloudPortfolios[0]).holdings || [];
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
    // Compare TOTAL holdings across ALL portfolios (multi-portfolio aware).
    const localPortfolioLen  = totalHoldingsCount();
    const remotePortfolioLen = cloudPortfolios.reduce((s, p) => s + (p.holdings?.length || 0), 0);

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

    // Adopt the cloud envelope: consolidate each portfolio's holdings.
    state.portfolios = cloudPortfolios.map(p => ({
      id: p.id || uuid(),
      name: (p.name || 'Portfolio').trim() || 'Portfolio',
      holdings: consolidatePortfolio(p.holdings || [])
    }));
    state.activePortfolioId = state.portfolios.some(p => p.id === cloudActiveId)
      ? cloudActiveId : state.portfolios[0].id;
    if (data.agent_results) state.agentResults = data.agent_results;

    const activeHoldings = (state.portfolios.find(p => p.id === state.activePortfolioId)
      || state.portfolios[0]).holdings;
    localStorage.setItem('investiq_v2', JSON.stringify({
      portfolios: state.portfolios,
      activePortfolioId: state.activePortfolioId,
      portfolio: activeHoldings, // legacy mirror for any older reader
      settings: state.settings,
      agentResults: state.agentResults
    }));
    if (remoteUpdatedAt) localStorage.setItem('investiq_updated_at', remoteUpdatedAt);
    console.log(`✓ Loaded from Supabase (${state.portfolios.length} portfolios, ${remotePortfolioLen} holdings total, updated ${remoteUpdatedAt})`);
    return true;
  } catch(e) { console.warn('Supabase load error:', e); return false; }
}

// Set true ONLY by the explicit "Clear All Data" flow so an intentional
// wipe can still write an empty portfolio. Every other path is blocked
// from clobbering a populated cloud with an empty local state.
let _allowEmptyCloudSave = false;

async function saveToSupabase() {
  if (!_supabase || !_supaUser) return;
  try {
    // ── DATA-LOSS GUARD ──────────────────────────────────────────────────
    // Never overwrite a NON-EMPTY cloud portfolio with an EMPTY local one
    // unless the user explicitly asked (Clear All Data). This stops a
    // failed cloud LOAD (which leaves local empty) from cascading into a
    // cloud WIPE on the next debounced save.
    if (!_allowEmptyCloudSave && totalHoldingsCount() === 0) {
      try {
        const { data: existing } = await _supabase
          .from('investiq_portfolios')
          .select('*')
          .eq('user_id', _supaUser.id)
          .maybeSingle();
        const cloudCount = (Array.isArray(existing?.portfolios) && existing.portfolios.length)
          ? existing.portfolios.reduce((s, p) => s + (p.holdings?.length || 0), 0)
          : (existing?.portfolio || []).length;
        if (cloudCount > 0) {
          console.error(`[saveToSupabase] BLOCKED: local portfolio is empty but cloud has ${cloudCount} holdings. Refusing to overwrite — this is almost certainly a failed load, not an intentional wipe. Use Admin → Force Reload from Cloud to recover.`);
          if (window.toast) toast.warning(`Save blocked — your ${cloudCount} cloud holdings are safe. Local view is empty (failed load). Use Admin → Force Reload from Cloud.`);
          return;
        }
      } catch(e) {
        // If we can't even check the cloud, err on the side of NOT saving.
        console.warn('[saveToSupabase] empty-guard cloud check failed — skipping save to be safe:', e.message);
        return;
      }
    }

    // Strip ALL local-only credentials before writing to cloud
    const settingsToSave = { ...state.settings };
    LOCAL_ONLY_SETTINGS.forEach(k => delete settingsToSave[k]);

    // DEFENSIVE DEDUPE — never write duplicate keys to cloud. Applied to
    // EACH portfolio independently. Kills the "doubled on next load" bug at
    // its source even if some other path produced duplicates.
    const _dedupe = (holdings, label) => {
      const seen = new Map();
      (holdings || []).forEach(h => {
        const key = `${(h.symbol||'').toUpperCase().trim()}::${(h.platform||'').toLowerCase().trim()}`;
        if (!seen.has(key)) {
          seen.set(key, h);
        } else {
          const prev = seen.get(key);
          const prevMaxDate = (prev.lots||[]).reduce((m,l) => l.date > m ? l.date : m, '');
          const curMaxDate  = (h.lots||[]).reduce((m,l) => l.date > m ? l.date : m, '');
          if (curMaxDate > prevMaxDate) seen.set(key, h);
          console.warn(`[saveToSupabase] duplicate key "${key}" in portfolio "${label}" — keeping one`);
        }
      });
      return [...seen.values()];
    };

    const dedupedPortfolios = listPortfolios().map(p => ({
      id: p.id,
      name: p.name,
      holdings: _dedupe(p.holdings, p.name)
    }));
    if (dedupedPortfolios.length === 0) dedupedPortfolios.push({ id: 'default', name: 'Personal', holdings: [] });
    // Push the deduped copy back into local state too.
    state.portfolios = dedupedPortfolios;
    const activeId = dedupedPortfolios.some(p => p.id === state.activePortfolioId)
      ? state.activePortfolioId : dedupedPortfolios[0].id;
    state.activePortfolioId = activeId;
    const activeHoldings = (dedupedPortfolios.find(p => p.id === activeId) || dedupedPortfolios[0]).holdings;
    const totalCount = dedupedPortfolios.reduce((s, p) => s + p.holdings.length, 0);

    const nowIso = new Date().toISOString();
    // Full payload includes the multi-portfolio columns (migration 016). The
    // legacy `portfolio` column is kept = active holdings for Edge-Function
    // compat. If those columns don't exist yet, retry with a legacy-only
    // payload so saving never breaks before the migration is run.
    const basePayload = {
      user_id: _supaUser.id,
      portfolio: activeHoldings,
      settings: settingsToSave,
      agent_results: state.agentResults,
      updated_at: nowIso
    };
    const fullPayload = { ...basePayload, portfolios: dedupedPortfolios, active_portfolio_id: activeId };

    let { error } = await _supabase
      .from('investiq_portfolios')
      .upsert(fullPayload, { onConflict: 'user_id' });
    if (error && /portfolios|active_portfolio_id|column|schema/i.test(error.message || '')) {
      console.warn('[saveToSupabase] multi-portfolio columns missing — run migration 016. Falling back to legacy save (active portfolio only).');
      if (window.toast) toast.warning('Multi-portfolio cloud sync needs migration 016. Saved the active portfolio for now.');
      ({ error } = await _supabase
        .from('investiq_portfolios')
        .upsert(basePayload, { onConflict: 'user_id' }));
    }
    if (error) {
      console.warn('Supabase save:', error.message);
    } else {
      state.settings.updatedAt = nowIso;
      localStorage.setItem('investiq_updated_at', nowIso);
      // Save-health: record the last KNOWN-GOOD cloud save (count + time).
      // Powers the 'Verify Backup Integrity' admin tool + answers
      // 'is my data safely backed up?' definitively.
      try {
        localStorage.setItem('investiq_last_good_save', JSON.stringify({
          at: nowIso, count: totalCount
        }));
      } catch(e) {}
      console.log(`✓ Saved to Supabase (${dedupedPortfolios.length} portfolios, ${totalCount} holdings, ${nowIso})`);
      updateSyncIndicator();
    }
  } catch(e) { console.warn('Supabase save error:', e); }
}

function scheduleSupa() {
  // Debounce: save to Supabase 2s after the last state change
  if (_savePending) clearTimeout(_savePending);
  _savePending = setTimeout(() => saveToSupabase(), 2000);
}
