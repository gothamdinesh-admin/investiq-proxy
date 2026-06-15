// ═══════════════════════════════════════════════════════════════════════
// 05-content.js — Edition-aware CONTENT REGISTRY  (CMS — Phase 0)
//
// Single source for editable user-facing copy. `cms(key, vars)` resolves a key
// to a string, interpolating {name}/{tagline}/{supportEmail} from the active
// EDITION (plus any extra vars passed in). Because most copy differs only by
// the brand token, `common` + interpolation avoids per-edition duplication —
// add an edition-scoped override only when the WORDING itself differs.
//
// `hydrateContent()` fills the DOM from the registry/edition:
//   [data-cms="key"]        → textContent = cms(key)
//   .edition-name           → textContent = EDITION.name
//   .support-email          → textContent = EDITION.supportEmail
//   .support-email-link     → textContent + mailto href = EDITION.supportEmail
//
// Loaded right after 00-config.js (needs EDITION). `cms()` is global, so every
// later module + the inline script can use it. PHASE 1 will merge Supabase-
// stored overrides into `_cmsOverrides` and add an Admin → Content editor.
// ═══════════════════════════════════════════════════════════════════════
const CONTENT = {
  common: {
    'onboarding.welcomeTitle': 'Welcome to {name}',
    'sync.connectedLabel':     '{name} Cloud',
    'trader.importLabel':      'Import from {name}',
    'signup.inviteBody':       'Thanks for signing up! {name} is currently invite-only — your account has been created and the admin has been notified.',
    'report.footer':           '{name} · {tagline}',
    'report.dataSource':       'Data sourced from your {name} portfolio.',
    'report.title':            '{name} Report',
    'tour.welcomeTitle':       '👋 Welcome to {name}',
    'pwa.installTitle':        'Install {name}',
    'pwa.installInstruction':  'Add {name} to your home screen for one-tap access.',
    'pwa.installed':           '{name} added to your home screen'
  },
  personal: {},
  harbour:  {}
};

// Phase 1: { harbour: { key: 'override' }, ... } loaded from Supabase cms_content.
let _cmsOverrides = {};

function cms(key, vars) {
  const edId = (typeof EDITION !== 'undefined' && EDITION && EDITION.id) ? EDITION.id : 'personal';
  let val = (_cmsOverrides[edId] && _cmsOverrides[edId][key])
         || (CONTENT[edId] && CONTENT[edId][key])
         || (CONTENT.common && CONTENT.common[key]);
  if (val == null) return key;   // missing key stays visible (not silent)
  const ed = (typeof EDITION !== 'undefined' && EDITION) ? EDITION : {};
  const ctx = Object.assign({
    name:         ed.name || 'InvestIQ',
    tagline:      ed.tagline || '',
    supportEmail: ed.supportEmail || ''
  }, vars || {});
  return String(val).replace(/\{(\w+)\}/g, (m, k) => (ctx[k] != null ? ctx[k] : m));
}

// Fill the DOM from the registry/edition. Idempotent — safe to call anytime.
function hydrateContent() {
  const ed = (typeof EDITION !== 'undefined' && EDITION) ? EDITION : {};
  document.querySelectorAll('[data-cms]').forEach(el => {
    el.textContent = cms(el.getAttribute('data-cms'));
  });
  document.querySelectorAll('.edition-name').forEach(el => {
    el.textContent = ed.name || 'InvestIQ';
  });
  document.querySelectorAll('.support-email').forEach(el => {
    if (ed.supportEmail) el.textContent = ed.supportEmail;
  });
  document.querySelectorAll('.support-email-link').forEach(el => {
    if (!ed.supportEmail) return;
    el.textContent = ed.supportEmail;
    el.setAttribute('href', `mailto:${ed.supportEmail}?subject=${encodeURIComponent((ed.name || 'InvestIQ') + ' — access request')}`);
  });
}

// ═══════════════════════════════════════════════════════════════════════
// PHASE 1 — Supabase-backed overrides + Admin → Content editor.
// cms_content table (migration 017) holds per-edition overrides. Read is open
// (so gate branding reflects overrides pre-login); writes are admin-only (RLS).
// ═══════════════════════════════════════════════════════════════════════

// Fetch this edition's overrides into _cmsOverrides, then re-hydrate the DOM.
// Safe no-op if Supabase/table absent (e.g. migration 017 not yet run).
async function loadCmsOverrides() {
  try {
    if (typeof _supabase === 'undefined' || !_supabase) return;
    const edId = (typeof EDITION !== 'undefined' && EDITION.id) ? EDITION.id : 'personal';
    const { data, error } = await _supabase.from('cms_content').select('key,value').eq('edition', edId);
    if (error) { console.warn('[cms] load skipped:', error.message); return; }
    _cmsOverrides[edId] = {};
    (data || []).forEach(r => { _cmsOverrides[edId][r.key] = r.value; });
    hydrateContent();
  } catch (e) { console.warn('[cms] load', e); }
}

// The code default for a key (interpolated, ignoring any override).
function _cmsDefault(key) {
  const ed = (typeof EDITION !== 'undefined' && EDITION) ? EDITION : {};
  const edId = ed.id || 'personal';
  let val = (CONTENT[edId] && CONTENT[edId][key]) || (CONTENT.common && CONTENT.common[key]);
  if (val == null) return key;
  const ctx = { name: ed.name || 'InvestIQ', tagline: ed.tagline || '', supportEmail: ed.supportEmail || '' };
  return String(val).replace(/\{(\w+)\}/g, (m, k) => (ctx[k] != null ? ctx[k] : m));
}

function _cmsId(k) { return 'cms_in_' + k.replace(/[^a-z0-9]/gi, '_'); }

// Renders the editor into #cmsEditorBody (Admin → Content card). Edits the
// ACTIVE edition (admins log into each edition's project separately).
function renderCmsEditor() {
  const body = document.getElementById('cmsEditorBody');
  if (!body) return;
  if (typeof _supabase === 'undefined' || !_supabase) {
    body.innerHTML = '<div class="text-xs neutral py-3">Cloud not connected — sign in to edit content.</div>';
    return;
  }
  const edId = (typeof EDITION !== 'undefined' && EDITION.id) ? EDITION.id : 'personal';
  const keys = Object.keys(CONTENT.common).sort();
  const esc = (typeof _escape === 'function') ? _escape : (s => String(s));
  const rows = keys.map(k => {
    const ov = (_cmsOverrides[edId] && _cmsOverrides[edId][k]) || '';
    return `<tr style="border-top:1px solid var(--border);">
      <td style="padding:8px;vertical-align:top;"><code style="font-size:11px;">${esc(k)}</code>
        <div class="neutral" style="font-size:10px;margin-top:3px;">default: ${esc(_cmsDefault(k))}</div></td>
      <td style="padding:8px;"><textarea id="${_cmsId(k)}" rows="2" class="input" style="width:100%;min-width:220px;font-size:12px;" placeholder="(uses default)">${esc(ov)}</textarea></td>
      <td style="padding:8px;white-space:nowrap;vertical-align:top;">
        <button onclick="saveCmsKey('${k}')" class="btn btn-sm btn-primary" style="font-size:11px;">Save</button>
        ${ov ? `<button onclick="resetCmsKey('${k}')" class="btn btn-sm btn-secondary" style="font-size:11px;margin-left:4px;">Reset</button>` : ''}
      </td></tr>`;
  }).join('');
  body.innerHTML = `<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;">
    <thead><tr style="text-align:left;color:var(--text-muted);font-size:11px;">
      <th style="padding:6px 8px;">Key</th><th style="padding:6px 8px;">Override value</th><th style="padding:6px 8px;"></th>
    </tr></thead><tbody>${rows}</tbody></table></div>`;
}

async function saveCmsKey(key) {
  const edId = (typeof EDITION !== 'undefined' && EDITION.id) ? EDITION.id : 'personal';
  const el = document.getElementById(_cmsId(key));
  if (!el) return;
  const value = el.value;
  if (!value.trim()) return resetCmsKey(key);   // blank = revert to default
  try {
    const { error } = await _supabase.from('cms_content').upsert({
      edition: edId, key, value,
      updated_by: (typeof _supaUser !== 'undefined' && _supaUser) ? _supaUser.id : null,
      updated_at: new Date().toISOString()
    }, { onConflict: 'edition,key' });
    if (error) throw error;
    _cmsOverrides[edId] = _cmsOverrides[edId] || {};
    _cmsOverrides[edId][key] = value;
    hydrateContent();
    renderCmsEditor();
    if (window.toast) toast.success('Saved · ' + key);
  } catch (e) { if (window.toast) toast.error('Save failed: ' + (e.message || e)); console.warn('[cms] save', e); }
}

async function resetCmsKey(key) {
  const edId = (typeof EDITION !== 'undefined' && EDITION.id) ? EDITION.id : 'personal';
  try {
    const { error } = await _supabase.from('cms_content').delete().eq('edition', edId).eq('key', key);
    if (error) throw error;
    if (_cmsOverrides[edId]) delete _cmsOverrides[edId][key];
    hydrateContent();
    renderCmsEditor();
    if (window.toast) toast.success('Reset · ' + key);
  } catch (e) { if (window.toast) toast.error('Reset failed: ' + (e.message || e)); }
}
