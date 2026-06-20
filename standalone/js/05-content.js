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
    'pwa.installed':           '{name} added to your home screen',
    // Section headings (edition-neutral defaults; editable per edition in the Studio)
    'section.holdings.title':    'All Holdings',
    'section.performance.title': 'Performance',
    'section.market.title':      'Market Pulse',
    'section.insights.title':    'AI Insights & Recommendations',
    'section.watchlist.title':   'Watchlist',
    'section.news.title':        'News',
    'section.dividends.title':   'Dividends',
    'section.reports.title':     'Reports',
    'overview.emptyTitle':       'Your portfolio is empty',
    'overview.briefTitle':       'Since yesterday',
    'chart.allocType':           'doughnut',
    'chart.allocTitle':          'Allocation',
    'chart.perfTitle':           'Performance',
    'brand.name':                '{name}',
    'brand.tagline':             '{tagline}'
  },
  personal: {},
  harbour:  {}
};

// ── CONTENT STUDIO schema (Phase 2) — groups the editable keys BY SITE AREA,
// so the admin editor mirrors the app section-by-section (SilverStripe-style).
// Add a field here (+ tag its element data-cms / use cms() at the call site)
// and it becomes editable in the Studio. type: 'text' | 'multiline'.
const CMS_SCHEMA = [
  { id: 'branding', label: 'Branding & Login', icon: 'fa-flag', fields: [
    { key: 'brand.name',              label: 'App name',                     type: 'text' },
    { key: 'brand.tagline',           label: 'Tagline',                      type: 'text' },
    { key: 'onboarding.welcomeTitle', label: 'Onboarding welcome heading',   type: 'text' },
    { key: 'signup.inviteBody',       label: 'Signup / invite message',      type: 'multiline' }
  ]},
  { id: 'layout', label: 'Dashboard layout', icon: 'fa-table-cells', fields: [
    { type: 'reorder', label: 'Overview block order' },
    { key: 'layout.overview.overnight',   label: 'Overview · Daily brief',       type: 'toggle' },
    { key: 'layout.overview.kpis',        label: 'Overview · KPI cards',         type: 'toggle' },
    { key: 'layout.overview.allocation',  label: 'Overview · Allocation chart',  type: 'toggle' },
    { key: 'layout.overview.performance', label: 'Overview · Performance chart',  type: 'toggle' },
    { key: 'layout.overview.topholdings', label: 'Overview · Top holdings',       type: 'toggle' }
  ]},
  { id: 'navigation', label: 'Navigation & sections', icon: 'fa-bars', fields: [
    // Whole sidebar groups. Off → the group's nav entry + all its sections hide.
    { key: 'nav.group.portfolio',    label: 'Portfolio — whole group',    type: 'toggle' },
    { key: 'nav.group.intelligence', label: 'Intelligence — whole group', type: 'toggle' },
    { key: 'nav.group.planning',     label: 'Planning — whole group',     type: 'toggle' },
    { key: 'nav.group.watchlist',    label: 'Watchlist — whole group',    type: 'toggle' },
    { key: 'nav.group.trader',       label: 'TraderIQ — whole group',     type: 'toggle' },
    // Individual sections within those groups.
    { key: 'nav.section.holdings',    label: '› Holdings',     type: 'toggle' },
    { key: 'nav.section.performance', label: '› Performance',  type: 'toggle' },
    { key: 'nav.section.dividends',   label: '› Dividends',    type: 'toggle' },
    { key: 'nav.section.insights',    label: '› AI Insights',  type: 'toggle' },
    { key: 'nav.section.askiq',       label: '› Ask IQ',       type: 'toggle' },
    { key: 'nav.section.market',      label: '› Market',       type: 'toggle' },
    { key: 'nav.section.news',        label: '› News',         type: 'toggle' },
    { key: 'nav.section.goals',       label: '› Goals',        type: 'toggle' },
    { key: 'nav.section.calendar',    label: '› Calendar',     type: 'toggle' },
    { key: 'nav.section.tax',         label: '› NZ Tax (FIF)', type: 'toggle' },
    { key: 'nav.section.reports',     label: '› Reports',      type: 'toggle' }
  ]},
  { id: 'charts', label: 'Charts', icon: 'fa-chart-pie', fields: [
    { key: 'chart.allocTitle', label: 'Allocation chart title',  type: 'text' },
    { key: 'chart.allocType',  label: 'Allocation chart type',   type: 'select', options: ['doughnut', 'pie', 'bar'] },
    { key: 'chart.perfTitle',  label: 'Performance chart title', type: 'text' }
  ]},
  { id: 'theme', label: 'Theme & colours', icon: 'fa-palette', fields: [
    { key: 'theme.accent',      label: 'Brand / chrome / links / CTA', type: 'color' },
    { key: 'theme.btnPrimary',  label: 'Primary button',               type: 'color' },
    { key: 'theme.bg',          label: 'Page background',              type: 'color' },
    { key: 'theme.bgPanel',     label: 'Cards',                        type: 'color' },
    { key: 'theme.border',      label: 'Borders',                      type: 'color' },
    { key: 'theme.textPrimary', label: 'Primary text',                 type: 'color' },
    { key: 'theme.gain',        label: 'Gains',                        type: 'color' },
    { key: 'theme.loss',        label: 'Losses',                       type: 'color' }
  ]},
  { id: 'overview', label: 'Overview', icon: 'fa-gauge-high', fields: [
    { key: 'overview.briefTitle', label: 'Daily brief heading',    type: 'text' },
    { key: 'overview.emptyTitle', label: 'Empty-portfolio heading', type: 'text' }
  ]},
  { id: 'holdings', label: 'Portfolio / Holdings', icon: 'fa-wallet', fields: [
    { key: 'section.holdings.title',    label: 'Holdings — heading',    type: 'text' },
    { key: 'section.performance.title', label: 'Performance — heading', type: 'text' },
    { key: 'section.dividends.title',   label: 'Dividends — heading',   type: 'text' }
  ]},
  { id: 'intelligence', label: 'Intelligence', icon: 'fa-brain', fields: [
    { key: 'section.insights.title', label: 'AI Insights — heading', type: 'text' },
    { key: 'section.market.title',   label: 'Market — heading',      type: 'text' },
    { key: 'section.news.title',     label: 'News — heading',        type: 'text' }
  ]},
  { id: 'planning', label: 'Planning & Reports', icon: 'fa-compass', fields: [
    { key: 'section.reports.title',  label: 'Reports — heading',     type: 'text' },
    { key: 'report.title',           label: 'Exported report title', type: 'text' },
    { key: 'report.footer',          label: 'Report footer',         type: 'text' },
    { key: 'report.dataSource',      label: 'Report data-source line', type: 'text' }
  ]},
  { id: 'watchlist', label: 'Watchlist', icon: 'fa-eye', fields: [
    { key: 'section.watchlist.title', label: 'Watchlist — heading', type: 'text' }
  ]},
  { id: 'mobile', label: 'Mobile · PWA · Tour', icon: 'fa-mobile-screen-button', fields: [
    { key: 'pwa.installTitle',       label: 'Install banner title',  type: 'text' },
    { key: 'pwa.installInstruction', label: 'Install instruction',   type: 'text' },
    { key: 'pwa.installed',          label: 'Installed toast',       type: 'text' },
    { key: 'tour.welcomeTitle',      label: 'Tour welcome',          type: 'text' }
  ]}
];
let _cmsStudioGroup = 'branding';

// Theme colour keys → the CSS custom property they override. Saved overrides are
// applied as inline custom properties on <html> (beats the stylesheet), so a
// colour edit recolours the chrome (var-driven), links, CTAs, gains/losses, etc.
const CMS_THEME_VARS = {
  'theme.accent':      '--accent',
  'theme.btnPrimary':  '--btn-primary',
  'theme.bg':          '--bg',
  'theme.bgPanel':     '--bg-panel',
  'theme.border':      '--border',
  'theme.textPrimary': '--text-primary',
  'theme.gain':        '--color-green',
  'theme.loss':        '--color-red'
};

// Reorderable top-level Overview blocks (DOM siblings tagged data-block).
// Default order matches the DOM, so no override = no change.
const CMS_BLOCKS = [
  { id: 'kpis',        label: 'KPI cards' },
  { id: 'overnight',   label: 'Daily brief' },
  { id: 'charts',      label: 'Charts (Allocation + Performance)' },
  { id: 'topholdings', label: 'Top holdings' }
];

function _cmsOrder() {
  const edId = (typeof EDITION !== 'undefined' && EDITION.id) ? EDITION.id : 'personal';
  const raw = _cmsOverrides[edId] && _cmsOverrides[edId]['layout.order'];
  let order = [];
  try { order = raw ? JSON.parse(raw) : []; } catch (e) {}
  const ids = CMS_BLOCKS.map(b => b.id);
  order = order.filter(id => ids.includes(id));
  ids.forEach(id => { if (!order.includes(id)) order.push(id); });   // append any new blocks
  return order;
}

// Reorder the tagged blocks among themselves (move DOM nodes before the stable
// sibling that follows the block group). No layout rewrite needed.
function applyCmsOrder() {
  const order = _cmsOrder();
  const nodes = order.map(id => document.querySelector('[data-block="' + id + '"]')).filter(Boolean);
  if (nodes.length < 2) return;
  const parent = nodes[0].parentNode;
  const domBlocks = [...parent.children].filter(c => c.getAttribute && c.getAttribute('data-block'));
  if (!domBlocks.length) return;
  const anchor = domBlocks[domBlocks.length - 1].nextSibling;   // first non-block sibling after the group
  nodes.forEach(n => { if (n.parentNode === parent) parent.insertBefore(n, anchor); });
}

function moveCmsBlock(id, dir) {
  const order = _cmsOrder();
  const i = order.indexOf(id);
  const j = i + (dir === 'up' ? -1 : 1);
  if (i < 0 || j < 0 || j >= order.length) return;
  const t = order[i]; order[i] = order[j]; order[j] = t;
  const val = JSON.stringify(order);
  const edId = (typeof EDITION !== 'undefined' && EDITION.id) ? EDITION.id : 'personal';
  _cmsOverrides[edId] = _cmsOverrides[edId] || {};
  _cmsOverrides[edId]['layout.order'] = val;
  applyCmsOrder();
  _cmsRefreshEditors();
  // Persist (best-effort; needs migration 017)
  if (typeof _supabase !== 'undefined' && _supabase) {
    _supabase.from('cms_content').upsert({
      edition: edId, key: 'layout.order', value: val,
      updated_by: (typeof _supaUser !== 'undefined' && _supaUser) ? _supaUser.id : null,
      updated_at: new Date().toISOString()
    }, { onConflict: 'edition,key' }).then(({ error }) => { if (error && window.toast) toast.error('Order not saved (run migration 017)'); });
  }
}

// Hide cards whose layout.<id> override is 'hidden'. Cards are tagged
// data-card="<id>" on a static wrapper, so this survives content re-renders.
function applyCmsLayout() {
  const edId = (typeof EDITION !== 'undefined' && EDITION.id) ? EDITION.id : 'personal';
  const ov = _cmsOverrides[edId] || {};
  document.querySelectorAll('[data-card]').forEach(el => {
    const hidden = ov['layout.' + el.getAttribute('data-card')] === 'hidden';
    el.style.display = hidden ? 'none' : '';
  });
}

// ── Navigation visibility (nav.group.* / nav.section.*) ────────────────
// A section is hidden if its own nav.section override is 'hidden' OR its
// parent sidebar group is hidden. A group is hidden if its nav.group override
// is 'hidden' OR every one of its child sections is individually hidden.
function _cmsNavOv() {
  const edId = (typeof EDITION !== 'undefined' && EDITION.id) ? EDITION.id : 'personal';
  return _cmsOverrides[edId] || {};
}
function isCmsSectionHidden(section) {
  const ov = _cmsNavOv();
  if (ov['nav.section.' + section] === 'hidden') return true;
  const g = (typeof _groupOf === 'function') ? _groupOf(section) : section;
  return ov['nav.group.' + g] === 'hidden';
}
function isCmsGroupHidden(groupId) {
  const ov = _cmsNavOv();
  if (ov['nav.group.' + groupId] === 'hidden') return true;
  // All children hidden ⇒ the group is effectively empty, so hide it too.
  const def = (typeof NAV_GROUPS !== 'undefined') ? NAV_GROUPS.find(g => g.id === groupId) : null;
  if (def && def.children.length && def.children.every(c => ov['nav.section.' + c] === 'hidden')) return true;
  return false;
}

// Hide/show sidebar groups, mobile drawer items and bottom tabs per nav.*
// overrides. overview/admin/family are not CMS-controlled (always-on or
// role-gated). Re-renders the active group's pill bar so hidden children drop.
function applyCmsNav() {
  const FIXED = new Set(['overview', 'admin', 'family']);
  // Sidebar primary groups.
  document.querySelectorAll('#primaryNav .nav-link[data-group]').forEach(el => {
    const g = el.getAttribute('data-group');
    if (FIXED.has(g)) return;
    el.style.display = isCmsGroupHidden(g) ? 'none' : '';
  });
  // Mobile drawer items (per-section onclick="showSection('x')").
  document.querySelectorAll('.drawer-item').forEach(el => {
    const m = /showSection\('([^']+)'/.exec(el.getAttribute('onclick') || '');
    if (!m) return;
    const s = m[1];
    if (FIXED.has(s)) return;
    el.style.display = isCmsSectionHidden(s) ? 'none' : '';
  });
  // Mobile bottom tabs (data-section).
  document.querySelectorAll('.mob-tab[data-section]').forEach(el => {
    const s = el.dataset.section;
    if (FIXED.has(s)) return;
    el.style.display = isCmsSectionHidden(s) ? 'none' : '';
  });
  // Re-render the sub-nav pills for the current section (drops hidden children),
  // and if the section we're on just got hidden, bounce to Overview.
  try {
    if (typeof currentSection !== 'undefined') {
      if (isCmsSectionHidden(currentSection) && typeof showSection === 'function') showSection('overview', null);
      else if (typeof renderGroupSubNav === 'function') renderGroupSubNav(currentSection);
    }
  } catch (e) {}
}

// Toggle a card's visibility (visible=true → delete override; false → store 'hidden').
async function setCmsToggle(key, visible) {
  if (typeof _supabase === 'undefined' || !_supabase) { if (window.toast) toast.error('Cloud not connected'); return; }
  const edId = (typeof EDITION !== 'undefined' && EDITION.id) ? EDITION.id : 'personal';
  try {
    if (visible) {
      const { error } = await _supabase.from('cms_content').delete().eq('edition', edId).eq('key', key);
      if (error) throw error;
      if (_cmsOverrides[edId]) delete _cmsOverrides[edId][key];
    } else {
      const { error } = await _supabase.from('cms_content').upsert({
        edition: edId, key, value: 'hidden',
        updated_by: (typeof _supaUser !== 'undefined' && _supaUser) ? _supaUser.id : null,
        updated_at: new Date().toISOString()
      }, { onConflict: 'edition,key' });
      if (error) throw error;
      _cmsOverrides[edId] = _cmsOverrides[edId] || {};
      _cmsOverrides[edId][key] = 'hidden';
    }
    if (key.indexOf('nav.') === 0) { try { applyCmsNav(); } catch(e) {} }
    else applyCmsLayout();
    _cmsRefreshEditors();
    if (window.toast) toast.success(key.indexOf('nav.') === 0 ? 'Navigation updated' : 'Layout updated');
  } catch (e) { if (window.toast) toast.error('Failed: ' + (e.message || e)); console.warn('[cms] toggle', e); }
}

function applyCmsTheme() {
  const edId = (typeof EDITION !== 'undefined' && EDITION.id) ? EDITION.id : 'personal';
  const ov = _cmsOverrides[edId] || {};
  const root = document.documentElement;
  Object.keys(CMS_THEME_VARS).forEach(key => {
    const cssVar = CMS_THEME_VARS[key];
    if (ov[key]) root.style.setProperty(cssVar, ov[key]);
    else root.style.removeProperty(cssVar);
  });
}

// Phase 1: { harbour: { key: 'override' }, ... } loaded from Supabase cms_content.
let _cmsOverrides = {};

// Effective app name / tagline — a CMS override (brand.name/brand.tagline) wins
// over the edition default. Read overrides DIRECTLY (not via cms()) to avoid
// recursion, since cms() interpolates {name}/{tagline} from these.
function cmsName() {
  const edId = (typeof EDITION !== 'undefined' && EDITION && EDITION.id) ? EDITION.id : 'personal';
  return (_cmsOverrides[edId] && _cmsOverrides[edId]['brand.name']) || (typeof EDITION !== 'undefined' && EDITION.name) || 'InvestIQ';
}
function cmsTagline() {
  const edId = (typeof EDITION !== 'undefined' && EDITION && EDITION.id) ? EDITION.id : 'personal';
  return (_cmsOverrides[edId] && _cmsOverrides[edId]['brand.tagline']) || (typeof EDITION !== 'undefined' && EDITION.tagline) || '';
}

function cms(key, vars) {
  const edId = (typeof EDITION !== 'undefined' && EDITION && EDITION.id) ? EDITION.id : 'personal';
  let val = (_cmsOverrides[edId] && _cmsOverrides[edId][key])
         || (CONTENT[edId] && CONTENT[edId][key])
         || (CONTENT.common && CONTENT.common[key]);
  if (val == null) return key;   // missing key stays visible (not silent)
  const ed = (typeof EDITION !== 'undefined' && EDITION) ? EDITION : {};
  const ctx = Object.assign({
    name:         cmsName(),
    tagline:      cmsTagline(),
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
    el.textContent = cmsName();
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
    try { applyCmsTheme(); } catch(e) {}
    try { applyCmsLayout(); } catch(e) {}
    try { applyCmsOrder(); } catch(e) {}
    try { applyCmsNav(); } catch(e) {}
    // If any chart override is set, re-render so charts pick up the config.
    if (Object.keys(_cmsOverrides[edId] || {}).some(k => k.indexOf('chart.') === 0) && typeof renderAll === 'function') { try { renderAll(); } catch(e) {} }
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
    try { applyCmsTheme(); } catch(e) {}
    if (key.indexOf('chart.') === 0 && typeof renderAll === 'function') { try { renderAll(); } catch(e) {} }
    if (key.indexOf('brand.') === 0 && typeof applyEdition === 'function') { try { applyEdition(); } catch(e) {} }
    _cmsRefreshEditors();
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
    try { applyCmsTheme(); } catch(e) {}
    if (key.indexOf('chart.') === 0 && typeof renderAll === 'function') { try { renderAll(); } catch(e) {} }
    if (key.indexOf('brand.') === 0 && typeof applyEdition === 'function') { try { applyEdition(); } catch(e) {} }
    _cmsRefreshEditors();
    if (window.toast) toast.success('Reset · ' + key);
  } catch (e) { if (window.toast) toast.error('Reset failed: ' + (e.message || e)); }
}

// Re-render whichever CMS editor is mounted (flat admin card and/or Studio page).
function _cmsRefreshEditors() {
  if (document.getElementById('cmsEditorBody')) { try { renderCmsEditor(); } catch(e){} }
  if (document.getElementById('cmsStudioGroups')) { try { renderCmsStudio(); } catch(e){} }
}

// ═══════════════════════════════════════════════════════════════════════
// CONTENT STUDIO (Phase 2) — SilverStripe-style two-pane editor on its own
// page (#section-cms). Left: site areas (CMS_SCHEMA groups). Right: the
// selected area's fields, each saving to cms_content for the active edition.
// ═══════════════════════════════════════════════════════════════════════
function selectCmsGroup(id) { _cmsStudioGroup = id; renderCmsStudio(); }

function renderCmsStudio() {
  const left = document.getElementById('cmsStudioGroups');
  const right = document.getElementById('cmsStudioFields');
  if (!left || !right) return;
  const esc = (typeof _escape === 'function') ? _escape : (s => String(s));
  const edId = (typeof EDITION !== 'undefined' && EDITION.id) ? EDITION.id : 'personal';

  if (typeof _supabase === 'undefined' || !_supabase) {
    right.innerHTML = '<div class="text-sm neutral" style="padding:24px;">Cloud not connected — sign in to edit content.</div>';
    left.innerHTML = '';
    return;
  }

  // Left rail — one row per site area, with how many overrides are set.
  left.innerHTML = CMS_SCHEMA.map(g => {
    const setCount = g.fields.filter(f => _cmsOverrides[edId] && _cmsOverrides[edId][f.key] != null).length;
    const active = g.id === _cmsStudioGroup;
    return `<button onclick="selectCmsGroup('${g.id}')" class="cms-group-btn" style="display:flex;align-items:center;gap:10px;width:100%;text-align:left;padding:10px 12px;border:none;border-radius:8px;cursor:pointer;font-size:13px;margin-bottom:2px;background:${active?'var(--accent-soft-2)':'transparent'};color:var(--text-primary);font-weight:${active?600:400};">
      <i class="fas ${g.icon}" style="width:16px;text-align:center;color:var(--accent);"></i>
      <span style="flex:1;">${esc(g.label)}</span>
      ${setCount ? `<span class="text-xs" style="background:var(--accent);color:#fff;border-radius:9999px;padding:1px 7px;font-size:10px;">${setCount}</span>` : ''}
    </button>`;
  }).join('');

  // Right pane — fields for the selected area.
  const group = CMS_SCHEMA.find(g => g.id === _cmsStudioGroup) || CMS_SCHEMA[0];
  right.innerHTML = `<div class="font-bold text-lg mb-1" style="color:var(--text-primary);">${esc(group.label)}</div>
    <div class="text-xs neutral mb-4">Editing the <b>${esc((typeof EDITION!=='undefined'&&EDITION.name)||'')}</b> edition. Blank = built-in default.</div>` +
    group.fields.map(f => {
      const ov = (_cmsOverrides[edId] && _cmsOverrides[edId][f.key]) || '';
      // Reorder control — ordered list of the Overview blocks with up/down.
      if (f.type === 'reorder') {
        const order = _cmsOrder();
        const labelOf = id => { const b = CMS_BLOCKS.find(x => x.id === id); return b ? b.label : id; };
        const rows = order.map((id, idx) => `<div class="flex items-center gap-2" style="padding:7px 10px;border:1px solid var(--border);border-radius:8px;margin-bottom:4px;">
            <span style="flex:1;font-size:13px;">${idx + 1}. ${esc(labelOf(id))}</span>
            <button onclick="moveCmsBlock('${id}','up')" class="btn btn-sm btn-secondary" style="font-size:11px;padding:3px 8px;" ${idx === 0 ? 'disabled style="opacity:.4;font-size:11px;padding:3px 8px;"' : ''}><i class="fas fa-arrow-up"></i></button>
            <button onclick="moveCmsBlock('${id}','down')" class="btn btn-sm btn-secondary" style="font-size:11px;padding:3px 8px;" ${idx === order.length - 1 ? 'disabled style="opacity:.4;font-size:11px;padding:3px 8px;"' : ''}><i class="fas fa-arrow-down"></i></button>
          </div>`).join('');
        return `<div class="mb-5"><label style="display:block;font-size:12px;margin-bottom:6px;">${esc(f.label)}</label>${rows}</div>`;
      }
      // Toggle fields → a visibility checkbox (checked = shown).
      if (f.type === 'toggle') {
        const hidden = ov === 'hidden';
        return `<div class="mb-3 flex items-center gap-3" style="padding:8px 10px;border:1px solid var(--border);border-radius:8px;">
          <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:13px;flex:1;">
            <input type="checkbox" ${hidden ? '' : 'checked'} onchange="setCmsToggle('${f.key}', this.checked)" style="width:16px;height:16px;cursor:pointer;">
            <span>${esc(f.label)}</span>
          </label>
          <span class="text-xs" style="color:${hidden ? 'var(--color-red)' : 'var(--color-green)'};">${hidden ? 'Hidden' : 'Shown'}</span>
        </div>`;
      }
      // Colour fields → a colour picker. Current = override else the live CSS var.
      if (f.type === 'color') {
        const cssVar = (typeof CMS_THEME_VARS !== 'undefined') ? CMS_THEME_VARS[f.key] : null;
        let cur = ov || (cssVar ? getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim() : '');
        if (!/^#[0-9a-fA-F]{6}$/.test(cur)) cur = '#000000';
        return `<div class="mb-4">
          <label style="display:block;font-size:12px;margin-bottom:4px;">${esc(f.label)} <code class="neutral" style="font-size:10px;">${esc(cssVar||f.key)}</code></label>
          <div class="flex items-center gap-2">
            <input type="color" id="${_cmsId(f.key)}" value="${cur}" style="width:46px;height:34px;border:1px solid var(--border);border-radius:6px;cursor:pointer;background:none;padding:2px;">
            <code class="neutral" style="font-size:11px;">${esc(cur)}</code>
            <button onclick="saveCmsKey('${f.key}')" class="btn btn-sm btn-primary" style="font-size:11px;">Save</button>
            ${ov ? `<button onclick="resetCmsKey('${f.key}')" class="btn btn-sm btn-secondary" style="font-size:11px;">Reset</button>` : '<span class="text-xs neutral" style="align-self:center;">(theme default)</span>'}
          </div>
        </div>`;
      }
      const def = esc(_cmsDefault(f.key));
      // Select fields → a dropdown (Save applies immediately).
      if (f.type === 'select') {
        const cur = ov || _cmsDefault(f.key);
        const opts = (f.options || []).map(o => `<option value="${esc(o)}" ${o === cur ? 'selected' : ''}>${esc(o)}</option>`).join('');
        return `<div class="mb-4">
          <label style="display:block;font-size:12px;margin-bottom:4px;">${esc(f.label)} <code class="neutral" style="font-size:10px;">${esc(f.key)}</code></label>
          <div class="flex gap-2 items-center">
            <select id="${_cmsId(f.key)}" class="input" style="width:auto;font-size:13px;">${opts}</select>
            <button onclick="saveCmsKey('${f.key}')" class="btn btn-sm btn-primary" style="font-size:11px;">Save</button>
            ${ov ? `<button onclick="resetCmsKey('${f.key}')" class="btn btn-sm btn-secondary" style="font-size:11px;">Reset</button>` : ''}
            <span class="text-xs neutral">default: ${def}</span>
          </div>
        </div>`;
      }
      const inp = f.type === 'multiline'
        ? `<textarea id="${_cmsId(f.key)}" rows="3" class="input" style="width:100%;font-size:13px;" placeholder="${def}">${esc(ov)}</textarea>`
        : `<input id="${_cmsId(f.key)}" type="text" class="input" style="width:100%;font-size:13px;" placeholder="${def}" value="${esc(ov)}">`;
      return `<div class="mb-4">
        <label style="display:block;font-size:12px;margin-bottom:4px;">${esc(f.label)} <code class="neutral" style="font-size:10px;">${esc(f.key)}</code></label>
        ${inp}
        <div class="flex gap-2 mt-2">
          <button onclick="saveCmsKey('${f.key}')" class="btn btn-sm btn-primary" style="font-size:11px;">Save</button>
          ${ov ? `<button onclick="resetCmsKey('${f.key}')" class="btn btn-sm btn-secondary" style="font-size:11px;">Reset to default</button>` : ''}
          <span class="text-xs neutral" style="align-self:center;">default: ${def}</span>
        </div>
      </div>`;
    }).join('');
}
