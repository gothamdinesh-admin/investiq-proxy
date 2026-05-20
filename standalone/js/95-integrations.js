// ═══════════════════════════════════════════════════════════════════════
// 95-integrations.js — Outbound integration adapters (v0.16)
//
// Demonstrable outbound integration layer for CEO/Harbour pitch. Builds
// canonical entity payloads (Contact, Lead, Portfolio Snapshot) shaped
// for Microsoft Dynamics 365 CRM and ships them via the InvestIQ proxy
// to dodge CORS + keep the Dynamics API key off the client.
//
// AUTH MODEL (production):
//   Browser → InvestIQ proxy (Render) → Microsoft Entra ID token exchange
//   → Dynamics 365 Web API
//   The proxy holds the Azure AD service-principal credentials.
//   The client just sends the entity payload + the destination env.
//
// FOR THIS DEMO STUB:
//   - Admin enters a Dynamics 365 endpoint URL in Settings → Admin.
//   - 'Test Dynamics Sync' on Admin Panel builds + POSTs sample payloads
//     to the proxy's /api/integrations/dynamics endpoint (mocked).
//   - The proxy logs what it would send and returns 200/202 so the demo
//     shows a complete round-trip without needing a real Dynamics tenant.
//
// PAYLOAD SHAPES — match Dynamics 365 Contact / Lead / custom entity
// schemas so when the real tenant + creds are wired, only the proxy
// endpoint changes.
//
// Depends on: state, _supaUser, _userProfile, getMetrics, fmt, _adminLog.
// ═══════════════════════════════════════════════════════════════════════

// Build a Dynamics 365 Contact entity payload from the signed-in user.
// Maps to the standard 'contact' table.
function buildDynamicsContactPayload() {
  if (!_supaUser) return null;
  const profile = (typeof _userProfile !== 'undefined' && _userProfile) || {};
  const fullName = profile.display_name || (_supaUser.email || '').split('@')[0] || 'InvestIQ User';
  const [firstName, ...rest] = fullName.split(/\s+/);
  return {
    // Standard Dynamics Contact fields
    firstname:           firstName || fullName,
    lastname:            rest.join(' ') || '—',
    emailaddress1:       _supaUser.email,
    investiq_userid:     _supaUser.id,
    investiq_created_at: _supaUser.created_at,
    // Custom fields (would map to investiq_ prefixed columns)
    investiq_plan:       profile.plan || 'free',
    investiq_role:       profile.is_admin ? 'admin' : 'user',
    investiq_country:    profile.country || 'NZ',
    investiq_status:     profile.is_approved ? 'active' : 'pending_approval',
    investiq_signup_source: 'web'
  };
}

// Build a Lead entity payload — for the onboarding funnel. A user who's
// signed up but not yet KYC-verified maps to a Dynamics Lead. Once KYC
// completes, the Lead converts to a Contact.
function buildDynamicsLeadPayload() {
  if (!_supaUser) return null;
  const profile = (typeof _userProfile !== 'undefined' && _userProfile) || {};
  return {
    subject:             `InvestIQ signup: ${_supaUser.email}`,
    firstname:           (profile.display_name || '').split(/\s+/)[0] || 'InvestIQ',
    lastname:            ((profile.display_name || '').split(/\s+/).slice(1).join(' ')) || 'Prospect',
    emailaddress1:       _supaUser.email,
    leadsourcecode:      100000000, // custom: 'InvestIQ Self-signup'
    investiq_userid:     _supaUser.id,
    investiq_signup_at:  _supaUser.created_at,
    statuscode:          1 // New
  };
}

// Build a Portfolio Snapshot payload — pushed on a daily schedule.
// Maps to a CUSTOM Dynamics entity 'investiq_portfoliosnapshot' that
// the Harbour Dynamics admin would create with these fields.
function buildDynamicsPortfolioSnapshotPayload() {
  if (!_supaUser) return null;
  const m = (typeof getMetrics === 'function') ? getMetrics() : null;
  if (!m) return null;
  return {
    // Foreign key to Contact via the investiq_userid match
    investiq_userid:        _supaUser.id,
    investiq_snapshot_date: new Date().toISOString().slice(0, 10),
    investiq_currency:      state?.settings?.currency || 'NZD',
    investiq_totalvalue:    Number(m.totalValue?.toFixed(2)) || 0,
    investiq_totalcost:     Number(m.totalCost?.toFixed(2)) || 0,
    investiq_totalgain:     Number(m.totalGain?.toFixed(2)) || 0,
    investiq_totalgain_pct: Number(m.totalGainPct?.toFixed(4)) || 0,
    investiq_holdings_count: (m.holdings || []).length,
    // AI score if recently computed
    investiq_aiscore:       state?.agentResults?.portfolioScore || null,
    investiq_risklevel:     state?.agentResults?.riskLevel || null,
    // Composition rollup
    investiq_breakdown:     JSON.stringify(_summariseHoldingsByType(m))
  };
}

function _summariseHoldingsByType(metrics) {
  const m = {};
  (metrics.holdings || []).forEach(h => {
    const t = h.type || 'other';
    if (!m[t]) m[t] = { count: 0, value: 0 };
    m[t].count++; m[t].value += (h.currentValue || 0);
  });
  return m;
}

// Send a payload to the proxy's Dynamics integration endpoint. The proxy
// performs the Microsoft Entra ID token exchange + actual Dynamics call.
// Returns { ok, status, body } so callers can show what happened.
async function sendToDynamics(entityName, payload, opts = {}) {
  const proxyBase = (state.settings.proxyUrl || PLATFORM_CONFIG.proxyUrl || '').replace(/\/$/, '');
  const dynamicsEndpoint = (state.settings.dynamicsEndpoint || '').trim();
  if (!proxyBase) return { ok: false, status: 0, body: 'No proxy URL set in Settings → Admin' };
  // If no Dynamics endpoint configured, still call the proxy so the demo
  // shows the payload being prepared; the proxy will return 'preview'.
  const url = `${proxyBase}/api/integrations/dynamics`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...proxyHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entity: entityName,
        target_url: dynamicsEndpoint || null,
        payload,
        meta: { source: 'investiq', preview: opts.preview !== false }
      }),
      signal: AbortSignal.timeout(15000)
    });
    const body = await res.text();
    let parsed = body; try { parsed = JSON.parse(body); } catch(e) {}
    return { ok: res.ok, status: res.status, body: parsed };
  } catch(e) {
    return { ok: false, status: 0, body: e.message };
  }
}

// Admin Panel hook — Test Dynamics Sync button. Builds + sends each of
// the three canonical entities, logs the result to the admin output box.
async function adminTestDynamicsSync() {
  if (typeof _adminClearOutput === 'function') _adminClearOutput();
  if (typeof _adminLog !== 'function') return;
  _adminLog('🔗 Dynamics 365 sync — building canonical payloads…');

  const tasks = [
    { name: 'Contact',            payload: buildDynamicsContactPayload() },
    { name: 'Lead',               payload: buildDynamicsLeadPayload() },
    { name: 'PortfolioSnapshot',  payload: buildDynamicsPortfolioSnapshotPayload() }
  ];

  for (const t of tasks) {
    if (!t.payload) { _adminLog(`  ✗ ${t.name}: skipped (missing data)`); continue; }
    _adminLog(`\n📤 ${t.name} payload preview:`);
    _adminLog(JSON.stringify(t.payload, null, 2));
    const result = await sendToDynamics(t.name, t.payload, { preview: true });
    if (result.ok) {
      _adminLog(`  ✓ ${t.name} sent — proxy returned ${result.status}`);
      if (typeof result.body === 'object') {
        _adminLog(`    response: ${JSON.stringify(result.body)}`);
      }
    } else {
      _adminLog(`  ⚠ ${t.name} — proxy returned ${result.status}: ${typeof result.body === 'string' ? result.body : JSON.stringify(result.body)}`);
      if (result.status === 404) _adminLog('    Hint: the proxy needs /api/integrations/dynamics added (see docs/INTEGRATIONS.md)');
    }
  }

  _adminLog('\n✓ Test complete. In production:');
  _adminLog('  1. Proxy holds Azure AD service-principal credentials');
  _adminLog('  2. Proxy exchanges them for a Dynamics Web API token');
  _adminLog('  3. Proxy POSTs the payload to ${dynamicsEndpoint}/api/data/v9.2/<entity>s');
  _adminLog('  4. Result returned to the browser without exposing creds');
}

// Expose globals so the Admin Panel onclick can find them
window.adminTestDynamicsSync = adminTestDynamicsSync;
window.buildDynamicsContactPayload = buildDynamicsContactPayload;
window.buildDynamicsLeadPayload = buildDynamicsLeadPayload;
window.buildDynamicsPortfolioSnapshotPayload = buildDynamicsPortfolioSnapshotPayload;
window.sendToDynamics = sendToDynamics;
