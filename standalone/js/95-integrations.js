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

// ═══════════════════════════════════════════════════════════════════════
// APEX CLEARING — Broker positions/transactions ingestion (v0.16)
//
// Apex Clearing (apexclearing.com) is the clearing-firm-of-record for
// Stake / Hatch / many NZ-facing brokers. Their REST API exposes
// /accounts, /positions, /transactions endpoints that let us pull
// the user's broker-side holdings automatically.
//
// AUTH MODEL: same proxy pattern as Dynamics. Apex API key lives on
// Render env vars. Per-user account tokens stored encrypted in
// profiles.apex_token_encrypted (column to add in a future migration).
//
// FOR THIS DEMO STUB: the proxy /api/integrations/apex endpoint returns
// a deterministic mock response so the round-trip is observable without
// needing a real Apex sandbox account.
// ═══════════════════════════════════════════════════════════════════════

async function apexPull(endpoint = 'positions') {
  const proxyBase = (state.settings.proxyUrl || PLATFORM_CONFIG.proxyUrl || '').replace(/\/$/, '');
  const accountId = (state.settings.apexAccountId || '').trim();
  if (!proxyBase) return { ok: false, status: 0, body: 'No proxy URL set' };
  try {
    const res = await fetch(`${proxyBase}/api/integrations/apex`, {
      method: 'POST',
      headers: { ...proxyHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint,
        account_id: accountId || null,
        meta: { source: 'investiq', preview: !accountId }
      }),
      signal: AbortSignal.timeout(15000)
    });
    const txt = await res.text();
    let parsed = txt; try { parsed = JSON.parse(txt); } catch(e) {}
    return { ok: res.ok, status: res.status, body: parsed };
  } catch(e) {
    return { ok: false, status: 0, body: e.message };
  }
}

// Reconcile mock Apex positions against the user's current portfolio.
// Returns a diff: what Apex has that we don't, and what we have that
// Apex doesn't.
function _reconcileApexPositions(apexPositions) {
  const ourSymbols = new Set((state.portfolio || []).map(h => (h.symbol || '').toUpperCase()));
  const apexSymbols = new Set((apexPositions || []).map(p => (p.symbol || '').toUpperCase()));
  const onlyInApex   = [...apexSymbols].filter(s => !ourSymbols.has(s));
  const onlyInOurs   = [...ourSymbols].filter(s => !apexSymbols.has(s));
  const inBoth       = [...apexSymbols].filter(s => ourSymbols.has(s));
  return { onlyInApex, onlyInOurs, inBoth };
}

async function adminTestApexSync() {
  if (typeof _adminClearOutput === 'function') _adminClearOutput();
  if (typeof _adminLog !== 'function') return;
  _adminLog('🔗 Apex Clearing sync — pulling broker-side data…');
  _adminLog(`  account_id = ${state.settings.apexAccountId || '<not set — preview mode>'}`);

  const endpoints = ['positions', 'transactions', 'account'];
  for (const ep of endpoints) {
    _adminLog(`\n📥 GET /apex/${ep}`);
    const result = await apexPull(ep);
    if (result.ok) {
      _adminLog(`  ✓ ${ep}: proxy returned ${result.status}`);
      if (typeof result.body === 'object') {
        // Show a compact preview — first 3 items if it's an array
        const sample = Array.isArray(result.body.data)
          ? `${result.body.data.length} record(s) · first 3: ${JSON.stringify(result.body.data.slice(0, 3), null, 2)}`
          : JSON.stringify(result.body, null, 2);
        _adminLog(`    ${sample}`);
        // Reconcile if positions
        if (ep === 'positions' && Array.isArray(result.body.data)) {
          const diff = _reconcileApexPositions(result.body.data);
          _adminLog(`\n  🔍 Reconciliation vs current portfolio:`);
          _adminLog(`    In both:        ${diff.inBoth.length} symbols [${diff.inBoth.slice(0, 5).join(', ')}${diff.inBoth.length > 5 ? '…' : ''}]`);
          _adminLog(`    Only in Apex:   ${diff.onlyInApex.length} symbols [${diff.onlyInApex.join(', ')}]`);
          _adminLog(`    Only in ours:   ${diff.onlyInOurs.length} symbols`);
        }
      }
    } else {
      _adminLog(`  ⚠ ${ep}: ${result.status} — ${typeof result.body === 'string' ? result.body : JSON.stringify(result.body)}`);
    }
  }
  _adminLog('\n✓ Test complete. In production:');
  _adminLog('  1. User links their Apex account via OAuth in onboarding');
  _adminLog('  2. Encrypted token stored in profiles.apex_token_encrypted');
  _adminLog('  3. Cron job pulls positions nightly, reconciles via _reconcileApexPositions');
  _adminLog('  4. Mismatches surfaced as notifications: "Apex shows AAPL +10 you don\'t have"');
}

window.adminTestApexSync = adminTestApexSync;
window.apexPull = apexPull;

// ═══════════════════════════════════════════════════════════════════════
// FORMS BY AIR — Onboarding webhook receiver (v0.16)
//
// Forms by Air (formsbyair.com) is a NZ-based form builder. Built-in
// FMA-compliant form templates for risk profiling, KYC, T&Cs sign-off.
//
// FLOW:
//   1. User completes form on Forms by Air branded subdomain.
//   2. Forms by Air fires a webhook to /api/integrations/forms-webhook.
//   3. Proxy validates the HMAC signature.
//   4. Proxy maps the form fields to profiles.* + investment_goals.* +
//      family invitations etc.
//   5. User's next sign-in shows the prefilled profile.
//
// FOR THIS DEMO: the admin-test button simulates a webhook payload so
// the receiving flow can be demonstrated end-to-end without a real
// Forms by Air subscription.
// ═══════════════════════════════════════════════════════════════════════

// Build a representative webhook payload — what Forms by Air would send
// after a user completes a 'New Investor Onboarding' form.
function buildFormsByAirSamplePayload() {
  return {
    form_id: 'investiq-onboarding-v1',
    submission_id: 'fba_' + Math.random().toString(36).slice(2, 12),
    submitted_at: new Date().toISOString(),
    submitter_email: _supaUser?.email || 'demo@example.com',
    fields: {
      // Identity
      full_name: 'Demo Investor',
      preferred_name: 'Demo',
      date_of_birth: '1990-03-14',
      nzbn_or_ird: '012-345-678',
      phone: '+64 21 555 0000',
      // KYC declarations
      tax_residency: 'NZ',
      pep_status: false,
      sanctions_check_consent: true,
      // Risk profile (5 questions, scored 1-5 each, sum determines profile)
      risk_q1_horizon: 5,         // 5 = 10+ years
      risk_q2_volatility_comfort: 4,
      risk_q3_loss_tolerance: 3,
      risk_q4_income_dependence: 4,
      risk_q5_experience: 4,
      computed_risk_profile: 'Growth', // server-side computed from above
      // Goals
      primary_goal: 'Retirement',
      target_amount: 1500000,
      target_date: '2050-01-01',
      monthly_contribution: 2000,
      // Consent
      terms_accepted: true,
      privacy_policy_accepted: true,
      marketing_optin: false
    }
  };
}

async function adminTestFormsByAirWebhook() {
  if (typeof _adminClearOutput === 'function') _adminClearOutput();
  if (typeof _adminLog !== 'function') return;
  _adminLog('📋 Forms by Air webhook — simulating an onboarding submission…');
  const payload = buildFormsByAirSamplePayload();
  _adminLog('\n📤 Webhook payload Forms by Air would send:');
  _adminLog(JSON.stringify(payload, null, 2));

  const proxyBase = (state.settings.proxyUrl || PLATFORM_CONFIG.proxyUrl || '').replace(/\/$/, '');
  try {
    const res = await fetch(`${proxyBase}/api/integrations/forms-webhook`, {
      method: 'POST',
      headers: { ...proxyHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000)
    });
    const txt = await res.text();
    let parsed = txt; try { parsed = JSON.parse(txt); } catch(e) {}
    if (res.ok) {
      _adminLog(`\n✓ Proxy accepted webhook (HTTP ${res.status})`);
      _adminLog(`  Response: ${JSON.stringify(parsed, null, 2)}`);
    } else {
      _adminLog(`\n⚠ Proxy returned ${res.status}: ${typeof parsed === 'string' ? parsed : JSON.stringify(parsed)}`);
    }
  } catch(e) {
    _adminLog(`\n✗ Network error: ${e.message}`);
  }

  _adminLog('\n✓ Test complete. In production:');
  _adminLog('  1. Forms by Air admin creates the form using the InvestIQ template');
  _adminLog('  2. Webhook URL points to {PROXY}/api/integrations/forms-webhook');
  _adminLog('  3. Proxy validates HMAC signature (FORMSBYAIR_WEBHOOK_SECRET env)');
  _adminLog('  4. Proxy upserts the fields into profiles + creates a Goal automatically');
  _adminLog('  5. User signs in to InvestIQ with profile pre-populated');
}

window.adminTestFormsByAirWebhook = adminTestFormsByAirWebhook;
window.buildFormsByAirSamplePayload = buildFormsByAirSamplePayload;
