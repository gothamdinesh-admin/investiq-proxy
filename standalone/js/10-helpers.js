// ═══════════════════════════════════════════════════════════════════════
// 10-helpers.js — Pure utility functions. No DOM mutation, no network.
// Depends on: 00-config.js (CURRENCY_SYMBOLS), and the global `state`
// (declared later in the inline script — looked up lazily at call time).
// ═══════════════════════════════════════════════════════════════════════

// Random-ish unique id for new rows/lots.
function uuid() { return Math.random().toString(36).substr(2,9) + Date.now().toString(36); }

// Format a number to fixed decimals, returns '–' for null/NaN.
function fmt(num, dec=2) {
  if (num === null || num === undefined || isNaN(num)) return '–';
  return Math.abs(num).toFixed(dec);
}

// Format a number with currency symbol + K/M shorthand.
function fmtCurrency(num, currency) {
  const sym = CURRENCY_SYMBOLS[currency || state.settings.currency] || '£';
  if (num === null || num === undefined || isNaN(num)) return sym+'–';
  const abs = Math.abs(num);
  let str;
  if (abs >= 1e6) str = (abs/1e6).toFixed(2)+'M';
  else if (abs >= 1e3) str = (abs/1e3).toFixed(1)+'K';
  else str = abs.toFixed(2);
  return sym + str;
}

// Format a positive/negative change with colour class and percent.
function fmtChange(num) {
  if (!num && num !== 0) return '<span class="neutral">–</span>';
  const cls = num >= 0 ? 'pos' : 'neg';
  const sign = num >= 0 ? '+' : '-';
  return `<span class="${cls}">${sign}${fmtCurrency(num)} (${sign}${fmt(Math.abs(num / (state.portfolio.reduce((s,h) => s + h.quantity*(h.purchasePrice||0),0) || 1)*100))}%)</span>`;
}

// CSS class for asset-type chip.
function getTagClass(type) {
  return 'tag tag-' + (type||'other').toLowerCase().replace(' ','');
}

// HTML-escape — full set (used in innerHTML).
function _escape(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// HTML-escape — single-quote only (used in onclick='...' attrs).
function esc(s) { return String(s ?? '').replace(/'/g, "&#39;"); }

// Friendly "5m ago" / "2h ago" / "3d ago" from a Date.
function timeSince(date) {
  const s = Math.floor((new Date() - date) / 1000);
  if (s < 60) return 'Just now';
  if (s < 3600) return Math.floor(s/60) + 'm ago';
  if (s < 86400) return Math.floor(s/3600) + 'h ago';
  return Math.floor(s/86400) + 'd ago';
}

// URL validation helper — returns null if OK, error string if bad.
function validateUrl(url, label, requireHttps = false) {
  if (!url) return null; // empty allowed (uses platform default)
  try {
    const u = new URL(url);
    if (!['http:','https:'].includes(u.protocol)) return `${label}: must be http or https`;
    if (requireHttps && u.protocol !== 'https:') return `${label}: must be HTTPS in production`;
    return null;
  } catch(e) {
    return `${label}: not a valid URL`;
  }
}

// Mask a Supabase anon key for display (first 12 + last 4).
function maskSupabaseKey(key) {
  if (!key) return 'Not set';
  if (key.length <= 14) return key;
  return key.slice(0, 12) + '...' + key.slice(-4);
}
