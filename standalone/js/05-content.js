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
    'tour.welcomeTitle':       '👋 Welcome to {name}'
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
