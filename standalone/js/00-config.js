// ═══════════════════════════════════════════════════════════════════════
// 00-config.js — Platform constants, baked-in config, currency tables.
// Loaded FIRST. No dependencies. Safe to read from any later module.
// ═══════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════
// EDITIONS (v0.29) — white-label / multi-tenant config. ONE codebase, many
// branded instances. Each edition overrides branding, theme, enabled features,
// and its OWN Supabase project (data isolation). Active edition is detected
// from the hostname, overridable via ?edition=<id> or localStorage for testing
// (e.g. open ?edition=harbour to preview the Harbour build locally).
// ═══════════════════════════════════════════════════════════════════════
const EDITIONS = {
  personal: {
    id: 'personal',
    name: 'InvestIQ',
    wordmark: { lead: 'Invest', accent: 'IQ' },      // .bm-invest + .bm-iq
    tagline: 'Intelligent Investing Dashboard',
    theme: 'navy',                                    // default theme (no [data-edition] override)
    features: { family: true, goals: true },
    supabaseUrl: 'https://szyclmouetbbigxexdrn.supabase.co',
    supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6eWNsbW91ZXRiYmlneGV4ZHJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0NjYzODcsImV4cCI6MjA5MjA0MjM4N30.gFdk7h0sRMQAiGFmPtqkICuD8E506mLElqT8P3dyQno'
  },
  harbour: {
    id: 'harbour',
    name: 'Harbour IQ',
    wordmark: { lead: 'Harbour', accent: 'IQ' },      // "IQ" shown in the brand accent
    tagline: 'Investment portfolio dashboard',        // TODO: confirm exact tagline with Harbour
    logo: 'assets/harbour/harbour-sails-blue.png',    // sails mark — on light surfaces
    logoOnDark: 'assets/harbour/harbour-sails-white.png', // white sails — on the blue chrome (nav)
    favicon: 'assets/harbour/harbour-sails-blue.png',
    theme: 'harbour',                                 // triggers [data-edition="harbour"] CSS overrides
    lightOnly: true,                                  // Harbour palette has no true-dark → light theme only
    // Brand (official quick guide): Harbour Blue #005A79 + slate #44546A;
    // secondary cyan #2BB0D4 / aqua #76CED9 / sand #D9BB8A / bronze #C29144.
    features: { family: false, goals: false },        // no Family, no Goals (per CEO trial scope)
    // Harbour's OWN Supabase project (data isolation). Key is the browser-safe
    // PUBLISHABLE key (RLS enforces security) — not a secret key.
    supabaseUrl: 'https://sxbzvvzsvvkaukqrqgjt.supabase.co',
    supabaseKey: 'sb_publishable_XvTbedw7tH80eKhO3JAhQQ_epZIJFmd'
  }
};

function detectEdition() {
  try {
    // Hostname is AUTHORITATIVE in production: a Harbour deploy is always Harbour,
    // and the personal domain is always personal — regardless of any stale override.
    const host = location.hostname.toLowerCase();
    if (host.includes('harbour')) return 'harbour';
    // ?edition=<id> is a TRANSIENT preview override — NOT persisted. (Persisting it
    // was the bug that stuck the personal site on Harbour after one preview visit.)
    const q = new URL(location.href).searchParams.get('edition');
    if (q && EDITIONS[q]) return q;
    // Clean up any override persisted by older builds.
    try { localStorage.removeItem('investiq_edition'); } catch(e) {}
  } catch(e) {}
  return 'personal';
}

const EDITION = EDITIONS[detectEdition()] || EDITIONS.personal;
// Apply the theme hook on <html> ASAP so the CSS override is live before paint.
try { document.documentElement.setAttribute('data-edition', EDITION.theme); } catch(e) {}

// PLATFORM CONFIG — managed by admin, baked in for all users.
// Regular users never need to enter these. Admin can override in Settings.
// The Supabase anon key is designed to be public; RLS enforces security.
// supabaseUrl/Key now come from the active EDITION (per-tenant data isolation).
const PLATFORM_CONFIG = {
  supabaseUrl:  EDITION.supabaseUrl,
  supabaseKey:  EDITION.supabaseKey,
  proxyUrl:     'https://investiq-proxy.onrender.com',
  adminEmails:  ['gothamdinesh@gmail.com'],
  // Set PROXY_SECRET here to match the PROXY_SECRET env var on your Render service.
  // This prevents anyone else from using your proxy to burn your Claude credits.
  // Leave blank for local dev (proxy will warn but still allow requests).
  proxySecret:  '',
  // AI provider — 'claude' (default, routed via our proxy to Anthropic) or
  // 'openai-compatible' (for LM Studio / Ollama / any local OpenAI-compatible
  // endpoint). Admin can override via settings.aiProvider + aiProviderUrl
  // + aiProviderKey in Settings → Admin Platform Config.
  // LM Studio default: http://localhost:1234/v1
  // Ollama default: http://localhost:11434/v1
  aiProvider:    'claude',
  aiProviderUrl: '',
  aiProviderKey: '',

  // Sentry error monitoring (Security C5).
  // Paste your Sentry frontend DSN here (looks like https://<key>@<id>.ingest.sentry.io/<project>).
  // Leave blank to disable; the SDK no-ops without a DSN.
  // Free tier covers ~5k events/month — plenty for this app's scale.
  sentryDsn:     'https://1645072bacece09fa8d47fd71a3f4ce5@o4511397337432064.ingest.de.sentry.io/4511397340512336'
};

// Currency symbol lookup — used by fmtCurrency.
const CURRENCY_SYMBOLS = { NZD:'NZ$', GBP:'£', USD:'$', EUR:'€', INR:'₹', AED:'د.إ', SGD:'S$', AUD:'A$' };

// Per-asset-type colours for charts and chips.
const ASSET_COLORS = {
  stock:'#818cf8', etf:'#60a5fa', crypto:'#fbbf24', bond:'#34d399',
  cash:'#94a3b8', mutualfund:'#c4b5fd', realestate:'#fb923c',
  fund:'#22d3ee',        // NZ managed funds — distinct teal
  kiwisaver:'#a78bfa',   // KiwiSaver — distinct violet
  other:'#64748b'
};

// CORS fallbacks for direct browser→Yahoo calls (when proxy is unreachable).
const CORS_PROXIES = [
  'https://corsproxy.io/?',
  'https://api.allorigins.win/raw?url='
];

// Credentials that must ALWAYS stay local — never saved to cloud, never overwritten from cloud.
// Keeps your API keys, Supabase creds, and Akahu tokens sticky across sessions/deploys.
const LOCAL_ONLY_SETTINGS = [
  'claudeApiKey',
  'supabaseUrl',
  'supabaseKey',
  'akahuAppToken',
  'akahuUserToken',
  'aiProviderUrl',   // LM Studio / Ollama URL is local-machine specific
  'aiProviderKey',   // Per-admin API key, never sync
  'proxySecret'      // Never leak
];

// ═══════════════════════════════════════════════════════════════════════
// IDLE SESSION TIMEOUT — auto-logout after N minutes of no user activity.
// Prevents lingering sessions on shared/lost devices.
// ═══════════════════════════════════════════════════════════════════════
const IDLE_LIMIT_MS = 120 * 60 * 1000; // 2 hours — only logs out after real inactivity
const IDLE_WARNING_MS = 5 * 60 * 1000; // warn 5 min before
