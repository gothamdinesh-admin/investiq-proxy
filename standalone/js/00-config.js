// ═══════════════════════════════════════════════════════════════════════
// 00-config.js — Platform constants, baked-in config, currency tables.
// Loaded FIRST. No dependencies. Safe to read from any later module.
// ═══════════════════════════════════════════════════════════════════════

// PLATFORM CONFIG — managed by admin, baked in for all users.
// Regular users never need to enter these. Admin can override in Settings.
// The Supabase anon key is designed to be public; RLS enforces security.
const PLATFORM_CONFIG = {
  supabaseUrl:  'https://szyclmouetbbigxexdrn.supabase.co',
  supabaseKey:  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6eWNsbW91ZXRiYmlneGV4ZHJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0NjYzODcsImV4cCI6MjA5MjA0MjM4N30.gFdk7h0sRMQAiGFmPtqkICuD8E506mLElqT8P3dyQno',
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
  aiProviderKey: ''
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
const IDLE_LIMIT_MS = 30 * 60 * 1000;  // 30 min — generous for portfolio review
const IDLE_WARNING_MS = 2 * 60 * 1000; // warn 2 min before
