# InvestIQ — Full LLM Handoff Document

_Self-contained reference for handing this project to a new LLM (Claude, GPT, local model, etc.). Read this and you have enough context to work on any part of the codebase without asking the human for context._

_Last revised: 2026-05-16 (v0.7a-family-foundation) — old sections below may reference v0.3-era code. The newer specialist docs are the source of truth where they conflict._

> **⚠️ READ THIS FIRST IF YOU'RE NEW:**
> The doc set has been refactored. Specialist docs replace big chunks of this file. Start with:
>
> - `PROJECT_CONTEXT.md` — high-level orientation (front door)
> - `ARCHITECTURE.md` — system diagram + data flows
> - `CODE_MAP.md` — every file + function explained
> - `SCALING.md` — what scales, what breaks, what to fix
> - `ROLES.md` — working agreement (human + AI)
> - `TODO.md` — current priorities
>
> Use this file (`LLM_HANDOFF.md`) for the **inline code excerpts, glossary, and playbooks** that aren't in the specialist docs. The high-level summaries in sections 0–7 of this file are now stale; trust the specialist docs over them when they disagree.

---

## v0.4 → v0.7a delta (what's changed since this doc was written)

This file was written at ~v0.3. Major shifts since then:

### Frontend
- `standalone/index.html` is now ~7,500 lines (was ~7,000)
- **JS split into 8 modules in `standalone/js/`** — 00-config, 10-helpers, 20-state, 30-cloud, 40-auth, 50-portfolio, 60-import, 70-ai. Loaded via `<script src>` before the inline script. ~1,800 lines extracted total.
- New **Holding Detail modal** with 1y price chart + per-lot P&L + AI Deep-Dive + ticker news
- New **Benchmark overlay** on Performance chart (NZX50 / S&P 500 / NASDAQ / FTSE / ASX 200)
- New **News tab** restructured: Daily Brief (Haiku-summarised) → Multi-source headlines → Per-ticker news
- New **NZ Fund + KiwiSaver** support with manual unit prices (staleness indicators, FIF excluded)
- New **Family Settings section** — create/invite/manage families with hierarchical visibility
- New **Plan placeholder** — Free/Pro/Family tiers (paywall deferred)
- Mobile UX pass — sticky portfolio summary, card-flow tables under 768px, 40px tap targets

### Proxy (`claude_proxy.py`)
- Now ~1,000 lines (was ~666)
- New routes: `/api/diag`, `/api/search`, `/api/history`, `/api/headlines`
- Granular 403 reasons via `_check_secret().fail_reason` + `_forbidden()` response with hints
- Multi-source RSS aggregator (8 sources, parallel fetch, 15-min cache)
- Yahoo ticker search typeahead
- Historical price series for one ticker (used by Holding Detail chart + benchmarks)

### Supabase
- New migration tier (007-010) for the **family platform**
- New helpers: `is_family_member()`, `my_family_role()`, `can_view_user()`
- New table: `families`, `family_members`, `family_invites`
- New columns on profiles: `active_family_id`, `plan_tier`, `display_name`, `digest_opt_in`, `digest_last_sent`
- Cross-table family-aware SELECT policies on `profiles`, `investiq_portfolios`, `investiq_snapshots`
- New SECURITY DEFINER RPC: `redeem_family_invite(p_token, p_code)`
- Auto-owner trigger on family creation

### Edge Functions
- `weekly-digest` — Monday-morning portfolio email via Resend, scheduled via pg_cron
- `family-invite` — email invite sender via Resend

### Tags
- `v0.4-news-brief`
- `v0.5-holding-detail-benchmarks`
- `v0.6-nz-funds`
- `v0.7a-family-foundation`

### Approval model
- Invite-only signup → admin approves → user gets per-user proxy_secret (in profiles)
- Admin can self-rotate their own proxy_secret (fixed bootstrap catch-22)
- Family members are NOT necessarily approved app users — they need their own approval

---

## 0. 30-second primer

**InvestIQ** is a single-page web app for **NZ-based retail investors** that consolidates portfolios from multiple platforms (eToro, Sharesies, Hatch, Harbour, ANZ, BNZ) into one dashboard with **live prices, NZ tax (FIF) tracking, and multi-agent Claude AI analysis.**

- **Frontend:** one HTML file (~7,000 lines vanilla JS + Tailwind CDN) on Netlify Pro
- **Backend:** Python HTTP proxy (~666 lines) on Render Starter — wraps Anthropic + Yahoo Finance + Akahu
- **Data:** Supabase Pro (auth + Postgres + RLS + 4 tables)
- **AI:** Claude — Haiku for scoring, Sonnet for analysis, Opus for synthesis (parallel fan-out / fan-in pattern)

The app is **invite-only**: new users sign up → land on a pending-approval gate → admin approves in Admin Panel → user gets per-user proxy secret + N free AI runs, then must email admin or supply their own Claude API key.

---

## 1. Repository layout

```
/c/Users/gotha/Downloads/Personal Investments/
├── README.md                       # human-facing product readme
├── netlify.toml                    # publish = "standalone"  (Netlify reads this)
├── render.yaml                     # startCommand: python claude_proxy.py
├── Procfile                        # web: python claude_proxy.py  (Render fallback)
├── requirements.txt                # yfinance (only Python dep)
├── claude_proxy.py                 # the ENTIRE proxy server — runs on Render
├── .gitignore                      # excludes .claude/ and webapp/ (abandoned Next.js)
├── standalone/
│   └── index.html                  # THE ENTIRE FRONTEND — vanilla JS + Tailwind CDN
└── docs/
    ├── PROJECT_CONTEXT.md          # architecture + file layout + what's built
    ├── MODEL_SELECTION.md          # which Claude model for which agent + why
    ├── GUARDRAILS.md               # NZ FMA wording rules, output contracts, security
    ├── SELF_CHECK.md               # 10-point pre-commit checklist
    ├── TODO.md                     # running prioritised task list
    └── LLM_HANDOFF.md              # THIS FILE
```

**Folders that USED to exist (now deleted):**
- `proxy/` — was a duplicate of root proxy files. Deleted 2026-05-06.
- `webapp/` — abandoned Next.js attempt. Still gitignored, harmless.

---

## 2. Hosting & deploy

| Tier | Service | Plan | What it does |
|---|---|---|---|
| Frontend | **Netlify** | Pro | Hosts `standalone/index.html`. Git push to `main` → auto-deploys in ~30s |
| Backend | **Render** | Starter ($7/mo) | Runs `claude_proxy.py`. No cold starts. URL pattern: `https://investiq-proxy.onrender.com` |
| Data | **Supabase** | Pro ($25/mo) | Postgres + Auth + RLS + 50GB |
| AI | **Anthropic** | pay-per-use | Claude API |
| Live prices | **Yahoo Finance** | free | via `yfinance` pip package |
| Banking | **Akahu** | free tier | Only `/accounts` works on free; `/holdings` paywalled |

**Repo on GitHub:** `gothamdinesh-admin/investiq-proxy` (single repo serves both the proxy and the dashboard)

**Render reads from repo root.** Don't put `claude_proxy.py` in a subfolder unless you also update `render.yaml` and `Procfile`.

**Netlify reads from `standalone/`** (per `netlify.toml`). Publish directory is `standalone`.

### Required environment variables (Render)

```
ANTHROPIC_API_KEY    sk-ant-...           # required, admin's Claude key
PROXY_SECRET         <64-char hex string> # required, admin override secret
ALLOWED_ORIGIN       https://your.netlify.app  # required for CORS
SUPABASE_URL         https://xxx.supabase.co   # for per-user secret validation
SUPABASE_ANON_KEY    eyJ... or sb_publishable_... # for per-user secret validation
RATE_LIMIT           60                   # optional, default 60 req/min/IP
```

### What `PLATFORM_CONFIG` in `standalone/index.html` looks like

Located around line 1960:

```js
const PLATFORM_CONFIG = {
  supabaseUrl:  'https://szyclmouetbbigxexdrn.supabase.co',
  supabaseKey:  'eyJ...',                 // publishable anon key, safe to expose
  proxyUrl:     'https://investiq-proxy.onrender.com',
  adminEmails:  ['gothamdinesh@gmail.com'],
  proxySecret:  '',                       // user sets via Settings (LOCAL_ONLY)
  aiProvider:   'claude',                 // or 'openai-compatible' for LM Studio
  aiProviderUrl: '',
  aiProviderKey: ''
};
```

---

## 3. The frontend — `standalone/index.html`

ONE file, ~7,000 lines. Structure top-to-bottom:

| Lines (approx) | Section | What's there |
|---|---|---|
| 1–410 | `<head>` | Tailwind config, custom CSS, Inter font, dark theme, mobile responsive media queries, defensive grid table CSS |
| 411–470 | Toast notification container | Empty `<div id="toastContainer">` populated at runtime |
| 471–565 | Auth gates | `#authGate` (login required) + `#pendingApprovalGate` (waiting for approval) |
| 566–~720 | Modals | Help, Onboarding (2-step), Quota exhausted, View holding, Add holding, Settings, Connections, Auth |
| ~720–800 | Top navbar | Logo, sync indicator, ADMIN badge, sign-in/out, AI Agents button, Help, Settings |
| 800–870 | Portfolio pulse strip | Top movers from YOUR holdings (not market ticker) |
| 870–1230 | Sections | `#section-overview`, `#section-holdings`, `#section-performance`, `#section-market`, `#section-insights`, `#section-watchlist`, `#section-tax`, `#section-news`, `#section-admin` |
| 1230–end | `<script>` | All the JS — ~6,000 lines |

### Key JS functions (greppable index)

**State + storage**
- `loadState()` — reads `localStorage.investiq_v2` into `state`
- `saveState()` — writes `state.portfolio` to localStorage, schedules cloud sync
- `clearLocalUserData({keepSettings})` — wipes state + localStorage on signOut/signIn

**Cloud sync (Supabase)**
- `initSupabase()` — creates the JS client from `PLATFORM_CONFIG`
- `loadFromSupabase()` — pulls portfolio + settings + agent_results, with staleness guard
- `saveToSupabase()` — debounced (2s) push, dedupes by key before writing
- `scheduleSupa()` — debounce timer
- `forceSyncFromCloud()` — manual button, bypasses staleness guard
- `recordDailySnapshot({date, force, source})` — writes one row to `investiq_snapshots`
- `loadSnapshotHistory(days)` — for performance chart
- `viewSnapshotByDate()` — time-travel view of holdings on a specific date
- `logActivity(type, details)` — fire-and-forget insert to `investiq_activity_log`

**Auth**
- `signIn(email, password)` — clears local cache, signs in, pulls fresh from cloud
- `signUp(email, password)` — Supabase signUp with email confirmation
- `signOut()` — flushes pending writes, clears local cache, logs out
- `submitAuth()` / `submitGateAuth()` — handlers for the two sign-in entry points
- `checkAdminStatus()` — sets `_isAdmin` based on profile.is_admin OR email allowlist
- `tryConsumeAiQuota()` — increments `ai_usage_count`, opens paywall if exceeded
- `updateAuthUI()` / `updateAdminVisibility()` / `updateApprovalGate()` — UI sync

**Holdings data model**
- `getHoldingBasis(h)` — computes weighted avg cost from `h.lots[]`
- `getMetrics()` — main reducer; returns `{holdings: [...], totalValue, totalCost, totalGain, totalGainPct, totalDayChange, ignoredCount, ignoredValue}`
- `consolidatePortfolio(holdings)` — dedupes by `symbol::platform` key, merges lots
- `healDuplicates(silent)` — runs after every load, fixes accumulated dup lots
- `autoNormalizeTickers(silent)` — rewrites BTC→BTC-USD, ETH→ETH-USD etc on every load
- `normaliseSymbol(sym, type)` — applies `CRYPTO_ALIAS` map
- `isPenceQuoted(sym)` — true for `.L` / `.IL` tickers (LSE pence conversion)
- `getFxRate(from, to)` — uses `state.marketData.fx` cached from /api/market

**CSV import**
- `importCSV(event)` → `_importCSVImpl(event)` — main entry, with import-in-progress lock
- `parseCSVLine(line)` — handles escaped quotes, BOM, fully-quoted rows
- `downloadCSVTemplate()` — generates blank CSV with column hints
- `loadEtoroHoldings()` — hard-coded sample data loader (demo)
- `importEtoro(e)` / `importSharesies(e)` / `importHarbour(e)` — platform-specific (older paths, mostly superseded by the smart-merge `importCSV`)

**AI agents**
- `runAgents()` — main entry; parallel fan-out of portfolio/market/opportunity → advisor synthesis
- `callClaude(agentKey, userMessage)` — calls proxy `/v1/messages`. Supports OpenAI-compatible fallback for LM Studio.
- `setAgentState(key, state, text)` — UI updater for the 4 agent cards
- `AGENT_DEFS` constant (around line ~4400) — system prompts, model IDs, max tokens for each agent

**Render functions** (called by `renderAll()`)
- `renderSummaryCards(metrics)` — Total Value, Return, Day Change, Diversification
- `renderSidebar(metrics)` — portfolio name + total + score ring
- `renderHoldingsTable(metrics)` — Overview's compact holdings table
- `renderDetailedHoldings(holdings, totalValue)` — Holdings tab's full table (canonical defensive grid pattern lives here — see SELF_CHECK 7b)
- `renderHoldingsByPlatform(holdings, totalValue)` — grouped variant
- `renderCharts(metrics)` — Chart.js doughnut + bar
- `renderRiskAnalysis(metrics)` — concentration warnings
- `renderQuickInsights(metrics)` — top movers, gainers/losers
- `renderPlatformBreakdown(metrics)` — per-platform totals
- `renderInsightsSection(results)` — agent output cards
- `updateTicker()` — Portfolio Pulse strip (top of page)
- `renderEmptyHoldings()` — empty state when no portfolio
- `refreshSidebarScore(metrics)` — chooses AI score > diversification score > dash

**NZ-specific features**
- `refreshFIF()` — Foreign Investment Fund tax check (NZ$50k threshold, FDR 5%)
- `LSE pence handling` — `isPenceQuoted()` + penceAdj in `getMetrics()`

**Watchlist + News**
- `addToWatchlist(sym)` / `removeFromWatchlist(sym)` / `refreshWatchlist()` / `renderWatchlist()`
- `loadNews(forceRefresh)` / `renderNews(articles)` / `getNewsScopeSymbols()`

**Admin Panel (admin-only)**
- `loadAdminData()` — pulls all profiles + portfolios for the user table
- `renderAdminTable(users)` — renders the user list with action buttons
- `adminApproveUser(id, email, approve)` — sets `is_approved` + generates `proxy_secret`
- `adminAdjustQuota(id, email, currentMax)` — prompt-based quota edit
- `adminRotateProxySecret(id, email)` — generate new secret, invalidates old
- `adminToggleAdmin(id, makeAdmin)` — grant/revoke admin
- `adminDeleteUser(id, email)` — soft-delete user data
- `adminTestSupabase()` / `adminTestProxy()` — diagnostics
- `adminHealDuplicates()` / `adminFixTickers()` — data fixers
- `adminForceReload()` / `adminClearCloudRow()` — recovery
- `loadActivityLog()` — recent events across all users

**Modals**
- `openModal(id)` — single-modal-at-a-time policy (closes others first)
- `closeModal(id)` / `closeModalBg(e, id)` — dismiss helpers
- Escape key closes topmost open modal
- `viewHolding(id)` / `editHolding(id)` / `deleteHolding(id)` — holding CRUD modals
- `toggleIgnoreHolding(id)` — exclude/include from totals
- `populateSettingsForm()` / `saveSettings()` / `validateUrl(url, label)` — settings panel

**Idle / activity tracking**
- `recordActivity()` — throttled to 5s
- `checkIdle()` — runs every 30s, 30-min timeout with 2-min warning

**Helper functions**
- `uuid()` — random ID
- `fmt(num, dec)` / `fmtCurrency(num, currency)` — number formatting
- `_escape(s)` — HTML escape (also `esc(s)` as alias for ' only)
- `toast.success/error/info/warning({title, message, duration})` — non-blocking notifications

### Global state shape

```js
let state = {
  portfolio: [
    {
      id: 'uuid',
      symbol: 'NVDA',              // uppercase, normalised
      name: 'NVIDIA Corporation',
      type: 'stock',               // stock|etf|crypto|bond|cash|mutualfund|realestate|other
      platform: 'eToro',
      currency: 'USD',             // native currency of the holding
      sector: 'Technology',
      country: 'United States',
      notes: '',
      ignored: false,              // if true, excluded from totals
      currentPrice: 201.64,        // live price in NATIVE currency (NOT FX-converted)
      dayChange: 1.20,
      dayChangePct: 0.6,
      lots: [
        { quantity: 3.007, price: 148.30, date: '2024-01-15', note: '' }
      ]
    }
    // ...
  ],
  settings: {
    name: 'My Portfolio',
    currency: 'NZD',               // user's base currency
    claudeApiKey: '',              // optional BYOK, LOCAL ONLY
    proxyUrl: '...',               // LOCAL ONLY
    supabaseUrl: '...',            // LOCAL ONLY (platform default)
    supabaseKey: '...',            // LOCAL ONLY
    proxySecret: '',               // LOCAL ONLY, admin override
    aiProvider: 'claude',          // or 'openai-compatible'
    aiProviderUrl: '',             // LM Studio etc, LOCAL ONLY
    aiProviderKey: '',             // LOCAL ONLY
    akahuAppToken: '',             // LOCAL ONLY
    akahuUserToken: '',            // LOCAL ONLY
    watchlist: [
      { symbol: 'TSLA', addedAt: '2026-04-19', currentPrice: 250, dayChangePct: 1.2 }
    ],
    onboardingComplete: true,
    updatedAt: '2026-05-06T...'    // cache-staleness guard
  },
  agentResults: {
    healthAnalysis: '...',
    marketAnalysis: '...',
    opportunities: '...',
    finalAdvice: '...',
    portfolioScore: 78
  },
  marketData: {
    indices:  { 'S&P 500': {price, change, changePct, name} },
    fx:       { 'USD/NZD': {...} },
    crypto:   { 'Bitcoin': {...} },
    commodities: { 'Gold': {...} }
  },
  _suspiciousHoldings: []          // for >500% gain sanity flag
};

// Module-level globals (not in state)
let _supabase = null;              // Supabase JS client
let _supaUser = null;              // current signed-in user object
let _isAdmin = false;              // computed from profiles.is_admin or adminEmails allowlist
let _userProfile = {};             // {is_admin, is_approved, ai_usage_count, ai_quota_max, proxy_secret}
let _adminUsers = [];              // cached user list for admin panel
let _savePending = null;           // debounce timer
let _importInProgress = false;     // CSV import lock
let _lastActivity = Date.now();    // for idle timeout
let _sortColumn = null;            // holdings table sort state
let _sortDir = 'desc';
let _newsCache = null;             // 5min client cache
```

### LOCAL_ONLY_SETTINGS

Fields that must never sync to cloud (stripped on save, preserved on load):

```js
const LOCAL_ONLY_SETTINGS = [
  'claudeApiKey',
  'supabaseUrl',
  'supabaseKey',
  'akahuAppToken',
  'akahuUserToken',
  'aiProviderUrl',
  'aiProviderKey',
  'proxySecret'
];
```

---

## 4. The proxy — `claude_proxy.py`

~666 lines. Single-file Python `BaseHTTPServer`. Threaded via `ThreadingMixIn`.

### Endpoints

| Method | Path | Auth | What |
|---|---|---|---|
| GET | `/health` | none | Status check (used by keep-alive ping) |
| GET | `/api/market` | proxy-secret | Indices + FX + crypto + commodities, 5min cache |
| GET | `/api/market?symbols=a,b,c` | proxy-secret | Bulk prices for portfolio symbols, 60s cache |
| GET | `/api/news?symbols=a,b,c&limit=3` | proxy-secret | Yahoo Finance news per ticker, 30min cache |
| POST | `/v1/messages` | proxy-secret + Anthropic key | Anthropic API forwarder |
| POST | `/api/akahu` | proxy-secret + Akahu tokens | NZ open banking (accounts + holdings) |
| POST | `/api/agents` | proxy-secret | Combined AI analysis (older path, mostly unused now) |

### Security layers (every non-OPTIONS, non-/health request)

1. **CORS allowlist** — `ALLOWED_ORIGIN` env var, comma-separated list of origins. Default `*` (dev only).
2. **Rate limit** — `RATE_LIMIT` env var (default 60 req/min/IP). Per-IP deque, 60s rolling window. Honours `X-Forwarded-For` for Render.
3. **Secret check** (`_check_secret()`):
   - Accepts global `PROXY_SECRET` env var (admin override)
   - OR per-user `X-Proxy-Secret` header validated via Supabase RPC `validate_proxy_secret(secret)` → returns `user_id` if approved
   - Cached 60s in `_secret_cache` to avoid hammering Supabase
4. **Body size cap** — POSTs >2MB rejected with 413

### Key functions

- `validate_user_secret(secret)` — calls `validate_proxy_secret` RPC on Supabase, caches result
- `_proxy_anthropic(body)` — forwards POST to `https://api.anthropic.com/v1/messages` with `x-api-key`
- `_proxy_akahu(body)` — fetches accounts + holdings, converts to InvestIQ format
- `_fetch_market()` — Yahoo indices/FX/crypto/commodities via `yfinance`
- `_fetch_prices(symbols)` — bulk `yf.download()` for portfolio symbols
- `_fetch_news(symbols, limit_per)` — `yf.Ticker(sym).news` per symbol, deduped + sorted
- `_yahoo_quotes(symbols)` — internal helper, handles single vs bulk

---

## 5. Database — Supabase schema

All tables in `public.*`. Row-Level Security ON everywhere. Postgres extensions used: `gen_random_uuid()`, `pgcrypto` (`gen_random_bytes`).

### `profiles` (one row per user)

```sql
create table public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  email           text,
  is_admin        boolean default false,
  is_approved     boolean default false,
  ai_usage_count  int default 0,
  ai_quota_max    int default 1,            -- admins get 9999
  proxy_secret    text,                     -- per-user, generated on approval
  requested_at    timestamptz default now(),
  created_at      timestamptz default now(),
  last_seen       timestamptz default now()
);

-- RLS
create policy "Users read own profile"   on profiles for select using (auth.uid() = id);
create policy "Users update own profile" on profiles for update using (auth.uid() = id);
create policy "Admins manage all profiles" on profiles for all
  using (public.is_admin()) with check (public.is_admin());
```

### `investiq_portfolios` (one row per user — entire portfolio as JSONB)

```sql
create table public.investiq_portfolios (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete cascade not null unique,
  portfolio     jsonb not null default '[]'::jsonb,   -- state.portfolio
  settings      jsonb not null default '{}'::jsonb,   -- state.settings (minus LOCAL_ONLY)
  agent_results jsonb,                                -- state.agentResults
  updated_at    timestamptz default now()
);

create policy "Users manage own portfolio" on investiq_portfolios for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Admins read all portfolios" on investiq_portfolios for select
  using (public.is_admin());
```

### `investiq_snapshots` (one row per user per day)

```sql
create table public.investiq_snapshots (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users(id) on delete cascade not null,
  snapshot_date   date not null,
  total_value     numeric(18,2) not null,
  total_cost      numeric(18,2) not null,
  total_gain      numeric(18,2) not null,
  total_gain_pct  numeric(8,4) not null,
  holdings_count  int not null,
  currency        text not null default 'NZD',
  breakdown       jsonb,                              -- {byType, byPlatform, source, holdings: [...]}
  created_at      timestamptz default now(),
  unique (user_id, snapshot_date)
);

create policy "Users manage own snapshots" on investiq_snapshots for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Admins read all snapshots" on investiq_snapshots for select
  using (public.is_admin());
```

### `investiq_activity_log` (audit trail)

```sql
create table public.investiq_activity_log (
  id          bigint generated always as identity primary key,
  user_id     uuid references auth.users(id) on delete cascade,
  event_type  text not null,     -- login/signup/logout/csv_import/holding_*/agent_run/...
  details     jsonb,
  ip_hint     text,
  user_agent  text,
  created_at  timestamptz default now()
);

create index idx_activity_user_time on investiq_activity_log(user_id, created_at desc);
create index idx_activity_type_time on investiq_activity_log(event_type, created_at desc);

create policy "Users insert own activity" on investiq_activity_log
  for insert with check (auth.uid() = user_id);
create policy "Users read own activity" on investiq_activity_log
  for select using (auth.uid() = user_id);
create policy "Admins read all activity" on investiq_activity_log
  for select using (public.is_admin());
```

### RPC functions

```sql
-- Returns true if current auth.uid() is an admin. Used by RLS policies to avoid recursion.
create function public.is_admin() returns boolean
language sql security definer stable
set search_path = public as $$
  select coalesce((select p.is_admin from profiles p where p.id = auth.uid()), false);
$$;
grant execute on function public.is_admin() to authenticated;

-- Generates a 48-char hex secret. Called from frontend on user approval.
create function public.generate_proxy_secret() returns text
language sql volatile as $$
  select encode(gen_random_bytes(24), 'hex');
$$;

-- Called from the Python proxy to validate a secret. Returns user_id or null.
create function public.validate_proxy_secret(secret text) returns uuid
language plpgsql security definer stable
set search_path = public as $$
declare uid uuid;
begin
  select id into uid from profiles
   where proxy_secret = secret and is_approved = true;
  return uid;
end;
$$;
grant execute on function public.validate_proxy_secret(text) to anon, authenticated;
```

### Email templates (Supabase Auth → Email Templates)

Four templates the human needs to set in the Supabase dashboard:
1. **Confirm signup** — welcome email with confirmation link + approval notice
2. **Reset password** — standard reset
3. **Magic link** — passwordless login (only if enabled)
4. **Change email** — confirm new address

Templates use Supabase Go variables `{{ .ConfirmationURL }}`, `{{ .Email }}`, `{{ .SiteURL }}`.

---

## 6. Critical data flows

### Auth + approval flow

```
1. New user → signs up → Supabase creates auth.users row
2. Trigger (manual or absent) → profiles row created with is_approved=false
3. User confirms email → lands on signed-in state
4. checkAdminStatus() fetches profile → _isAdmin=false, _userProfile.is_approved=false
5. updateApprovalGate() shows #pendingApprovalGate full-screen overlay
6. User sees "Pending admin approval", can email admin or sign out
7. Admin logs in → Admin Panel → user list → clicks Approve
8. adminApproveUser() → generates proxy_secret via RPC → updates is_approved=true
9. User refreshes → profile.is_approved=true now → gate disappears → app loads
```

### CSV import flow

```
1. User clicks "Upload CSV" + picks date + optional "Replace all"
2. _importCSVImpl() validates file size (5MB max) + mime type
3. parseCSVLine() handles each row — robust to escaped quotes, BOM, fully-quoted
4. For each row:
   a. normaliseSymbol(symbol, type) — BTC → BTC-USD via CRYPTO_ALIAS
   b. Match existing holding by (symbol, normPlat(platform)) — case-insensitive
   c. Fallback to symbol-only match if no platform match
   d. Smart merge: overwrite lots with one clean lot at CSV quantity + price
   e. If no match found, create new holding
5. saveState() → scheduleSupa() → saveToSupabase() in 2s
6. refreshMarketData() → refreshPortfolioPrices() → renderAll()
7. recordDailySnapshot({date: chosenDate, force: true, source: 'csv-import'})
8. logActivity('csv_import', {updated, newCreated, removed, ...})
```

### AI agent run flow

```
1. User clicks Run AI Agents
2. tryConsumeAiQuota() — admin/BYOK skip; else check ai_usage_count < ai_quota_max
   - If exceeded → opens #quotaExhaustedModal with two options
   - Else increments count server-side, allows run
3. Build portfolio + market context
4. Promise.all([
     callClaude('portfolio', baseMsg),   // Haiku — diversification score
     callClaude('market',    baseMsg),   // Sonnet — macro analysis
     callClaude('opportunity', baseMsg)  // Sonnet — gap analysis
   ])
5. After all three resolve, callClaude('advisor', synthesisMsg) — Opus
6. Each call:
   a. proxyHeaders() picks secret: user_profile.proxy_secret > settings.proxySecret > PLATFORM_CONFIG.proxySecret
   b. POST to proxyUrl + /v1/messages
   c. Proxy validates secret via Supabase RPC (cached 60s)
   d. Proxy forwards to Anthropic with the platform Claude key (or user-supplied)
7. setAgentState() updates each card as agents complete
8. state.agentResults stored → saveState → cloud
9. logActivity('agent_run', {holdingsCount, portfolioScore})
```

### Daily snapshot flow

```
1. On every page load, after live prices fetched:
2. recordDailySnapshot() — checks if today's snapshot exists, skips if so
3. getMetrics() → compute totals
4. Serialise per-holding payload {symbol, quantity, avgBuyPrice, currentValue, ...}
5. Upsert to investiq_snapshots with (user_id, snapshot_date) conflict resolution
6. On CSV import or manual capture, force=true to overwrite
```

### Self-healing loads

Every page load runs in this order:
1. `loadState()` from localStorage
2. `consolidatePortfolio()` — dedup by symbol::platform key
3. `autoNormalizeTickers()` — BTC → BTC-USD
4. `healDuplicates()` — two-pass dup detection (holdings + lots within holding)
5. `loadFromSupabase()` (if signed in) — staleness guard, then same 3 heal steps
6. `renderAll()`

---

## 7. NZ-specific rules (read GUARDRAILS.md too)

### FMA compliance — vocabulary
| ✅ Use | ❌ Never use |
|---|---|
| "analysis" | "advice" |
| "observation" | "recommendation" |
| "consideration" | "you should buy/sell" |
| "data suggests" | "I recommend" |

### FIF (Foreign Investment Fund) tax
- NZ residents with overseas cost basis > NZ$50,000 owe FIF income tax
- `refreshFIF()` computes overseas cost basis in NZD
- Threshold check + FDR 5% method estimate
- NZ-listed holdings exempt (must have `country` field matching "New Zealand" / "NZ" / "Aotearoa")

### LSE pence normalisation
- Yahoo quotes `.L` tickers in pence; CSV usually has pounds
- `isPenceQuoted(sym)` detects `.L` / `.IL` suffix
- `getMetrics()` multiplies FX by 0.01 for those tickers
- Without this, AZN.L shows +14389% gain

### Crypto ticker aliases
```js
const CRYPTO_ALIAS = {
  'BTC': 'BTC-USD', 'BITCOIN': 'BTC-USD',
  'ETH': 'ETH-USD', 'ETHEREUM': 'ETH-USD',
  // ... 16 more
};
```
- `normaliseSymbol()` runs on every CSV import row
- `autoNormalizeTickers()` runs on every page load to fix legacy data

---

## 8. AI agents — model selection

(Full rationale in `docs/MODEL_SELECTION.md`)

| Agent | Model | Why |
|---|---|---|
| 📊 Portfolio Health | `claude-haiku-4-5` | Pure data analysis, structured score output |
| 🌍 Market Impact | `claude-sonnet-4-5` | Needs real-world market knowledge + reasoning |
| 🔭 Opportunity Scout | `claude-sonnet-4-5` | Creative gap analysis with named tickers |
| 💼 Senior Advisor | `claude-opus-4-5` | Synthesises all 3 + portfolio data into action plan |

**Pattern: 3× fan-out (Haiku + 2× Sonnet) in parallel → 1× Opus synthesis.** Wall time ≈ 10-20s.

System prompts live in `AGENT_DEFS` constant (~line 4400). Output contracts:
- Portfolio Health MUST start with `Health Score: X/100` (parsed by regex `/Health Score:\s*(\d+)/i`)
- Each agent capped at ~220 words (advisor 300)
- Words like "recommendation" → "analysis"

---

## 9. Common LLM tasks — playbooks

### "User reports a holding shows wrong price"
1. Check `state.portfolio` — find the holding, log its symbol + currency
2. Check `state.marketData.fx` — is FX rate populated for that currency?
3. Run `adminTestProxy()` — proxy responding?
4. Yahoo Finance may not have data for some non-US tickers (LSE pence, HK suffix)
5. Verify `normaliseSymbol()` mapped it correctly — try `Admin → Fix Crypto Tickers`

### "User can't sign in / sees pending approval but they're approved"
1. Check `profiles.is_approved` in Supabase — is it true?
2. Check `profiles.proxy_secret` — is it populated? If null, AI agents will fail
3. Try `Admin → Force Reload from Cloud` in their browser
4. Verify the `is_admin()` RPC works: `select public.is_admin()` in SQL editor

### "Total return looks wrong (huge gain/loss)"
1. Check the Holdings table — is one row showing >500% gain?
2. Check if it's an LSE ticker (`.L`) — `isPenceQuoted()` should normalise
3. Check if it's crypto with wrong symbol (BTC vs BTC-USD)
4. `state._suspiciousHoldings` lists outliers — excluded from Best Performer

### "User wants to add a new feature"
1. Read `docs/TODO.md` first — likely already planned
2. Read `docs/SELF_CHECK.md` before committing
3. All code changes go in `standalone/index.html` (or `claude_proxy.py` if backend)
4. After changes:
   - Syntax check: `node -e "..."` on the inline scripts
   - Grep for orphan references (functions/IDs removed)
   - Commit with descriptive message + `git push origin main`
   - Netlify auto-deploys in ~30s

### "Proxy errors / Render deploy fails"
1. Check Render dashboard → Build & Deploy → Start Command — must be exactly `python claude_proxy.py`
2. Check `claude_proxy.py` exists at repo root (NOT just in subfolders)
3. Verify env vars: `ANTHROPIC_API_KEY`, `PROXY_SECRET`, `ALLOWED_ORIGIN`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`
4. Logs: Render → Logs tab; common issue is missing env var

### "Database error after running SQL"
1. Sequence matters — `is_approved` column must exist before policies that reference it
2. Use `add column if not exists` and `drop policy if exists` patterns
3. The `is_admin()` function needs `SECURITY DEFINER` to bypass RLS

---

## 10. Glossary

| Term | Meaning |
|---|---|
| **FIF** | Foreign Investment Fund — NZ tax regime for overseas holdings > NZ$50k cost basis |
| **FDR** | Fair Dividend Rate — 5% deemed return method under FIF |
| **CV** | Comparative Value — alternative FIF calculation method (sometimes lower tax) |
| **FMA** | Financial Markets Authority — NZ regulator. "Advice" requires a licence; "analysis" doesn't. |
| **Akahu** | NZ open banking API. Free tier exposes `/accounts`, paid tier exposes `/holdings`. |
| **PLATFORM_CONFIG** | Constants at top of standalone/index.html with default Supabase/proxy URLs |
| **LOCAL_ONLY_SETTINGS** | Settings keys that never sync to cloud (API keys, tokens, secrets) |
| **RLS** | Row-Level Security — Postgres feature ensuring users only see their own rows |
| **RPC** | Remote Procedure Call — Supabase exposes Postgres functions over REST |
| **BYOK** | Bring Your Own Key — user supplies own Claude API key, skips quota |
| **Lots** | Individual purchase records per holding (quantity, price, date) — weighted-avg cost basis |
| **NZ$50k threshold** | If overseas cost basis exceeds this, FIF tax applies |
| **Smart merge** | CSV import that matches by symbol+platform, overwrites lots with new clean data |

---

## 11. What's where — quick file finder

| Need to change… | Look at… |
|---|---|
| The UI of any section | `standalone/index.html` — section IDs follow `#section-NAME` |
| AI agent prompts / models | `AGENT_DEFS` constant near line 4400 of standalone/index.html |
| What gets sent in a proxy request | `proxyHeaders()` ~line 1992 |
| How holdings are computed | `getMetrics()` ~line 3529 |
| CSV import logic | `_importCSVImpl()` ~line 3237 |
| Admin panel UI | `#section-admin` div in HTML + `renderAdminTable()` ~line 6456 |
| Proxy endpoints | `claude_proxy.py`, methods `do_GET` and `do_POST` |
| Database tables | Section 5 above + SQL Editor on Supabase |
| Email templates | Supabase dashboard → Authentication → Email Templates (not in source code) |
| Deploy config | `render.yaml` (proxy) + `netlify.toml` (frontend) + Render env vars |

---

## 12. Operating principles (from earlier sessions)

These rules are enshrined in `MEMORY.md` and should be respected:

1. **Two strikes and out** — if an approach fails twice, abandon and try a different angle or ask the human.
2. **Watch for chat-rendering disguises** — if a paste contains filenames or URLs, the chat may auto-link them. Check actual file/repo state, not what's displayed.
3. **For dashboard config debugging, request a screenshot first** — saves round-tripping.
4. **All code changes go through the SELF_CHECK** — 10-point pre-commit checklist in `docs/SELF_CHECK.md`.
5. **Never use words like "advice" or "recommendation"** in user-facing copy or agent prompts — FMA compliance.
6. **API keys never leave the browser** — `LOCAL_ONLY_SETTINGS` list enforces this.
7. **Single-modal-at-a-time** — opening a modal closes any others.
8. **Defensive grid table pattern** — `display:grid` inline, `min-width:0`, ellipsis, `flex-shrink:0`. See SELF_CHECK 7b.

---

## 13. For local LLMs specifically

If you're a local LLM (LM Studio, Ollama, etc.) being asked to work on InvestIQ:

- **You can read this whole doc and have full context**. The codebase has 2 files of substance: `standalone/index.html` (~7,000 lines) and `claude_proxy.py` (~666 lines). Plus 6 docs in `docs/`.
- **Always grep before editing** — duplicate function names, similar variable names, and old code paths exist. Find ALL callers before changing a function.
- **The dashboard at runtime calls Claude via the proxy.** If the admin enables `aiProvider: 'openai-compatible'` + URL pointing at YOU, you'll get the agent calls. Match the OpenAI Chat Completions API format (`/chat/completions`, `messages[]`, `choices[].message.content`).
- **Don't rewrite working code** unless asked. Targeted edits beat refactors.
- **Update this doc** when you make architectural changes — keep it the single source of truth.

---

## 14. Open work — pick from `docs/TODO.md`

High-impact unshipped items (as of 2026-05-06):

| Effort | Item |
|---|---|
| 30 min | Sentry error monitoring (free tier) |
| 1 hour | Snapshot TTL (DELETE rows older than 1 year) |
| 1 hour | DB webhook → email admin on every signup (Resend) |
| 1 hour | "You're approved" email when admin clicks Approve |
| 2 hours | Netlify deploy previews per branch |
| 3 hours | Benchmark overlay on performance chart (NZX 50 + S&P 500) |
| half day | Dividend tracking (NZ moat — Sharesight charges for this) |
| half day | Stripe billing — Free/Pro/Premium tiers |
| half day | Migrate proxy to Supabase Edge Functions (kill Render) |
| full day | Holding detail page (1y chart + lot history + per-holding AI) |
| full week | React + TypeScript + Vite migration (V2 in PROJECT_CONTEXT.md) |

---

_End of LLM handoff document. Cross-reference `docs/PROJECT_CONTEXT.md` for narrative architecture, `docs/MODEL_SELECTION.md` for AI strategy, `docs/GUARDRAILS.md` for compliance/security, `docs/SELF_CHECK.md` for pre-commit checks, `docs/TODO.md` for the running task list._
