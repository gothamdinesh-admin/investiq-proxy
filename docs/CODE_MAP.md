# Code Map — File-by-File Reference

_Every file in the repo, what it does, and what to look at when something breaks. Refresh whenever the codebase shifts meaningfully._

Last updated: 2026-05-16 · v0.7a-family-foundation
Repo size: ~11,000 lines of code across 18 files (excluding docs)

---

## Repo Layout

```
C:\Users\gotha\Downloads\Personal Investments\
├── README.md
├── netlify.toml                       Netlify deploy config (publishes /standalone)
├── render.yaml                        Render deploy config (Python proxy)
├── claude_proxy.py                    THE Python proxy server (1,000 lines)
│
├── standalone/                        THE frontend — drag this folder to Netlify
│   ├── index.html                     Main app (7,556 lines — HTML + CSS + inline JS)
│   └── js/                            Extracted JS modules (loaded before inline script)
│       ├── 00-config.js               (65)  Platform config + currency tables + idle constants
│       ├── 10-helpers.js              (76)  Pure utility fns: uuid, fmt, fmtCurrency, esc…
│       ├── 20-state.js                (68)  state object + loadState/saveState + FX persist
│       ├── 30-cloud.js                (165) Supabase init + loadFromSupabase + saveToSupabase
│       ├── 40-auth.js                 (161) Auth gate UI + idle session timeout
│       ├── 50-portfolio.js            (414) Portfolio math + FX + Yahoo market refresh
│       ├── 60-import.js               (376) CSV import + eToro demo loader + ticker norm
│       └── 70-ai.js                   (421) Multi-agent Claude pipeline + agent UI
│
├── supabase/
│   ├── functions/
│   │   ├── weekly-digest/             Monday-morning portfolio digest email
│   │   │   ├── index.ts               (260) Deno Edge Function
│   │   │   └── setup.sql              (73)  One-time pg_cron schedule
│   │   └── family-invite/             Email family-invite sender
│   │       └── index.ts               (191) Deno Edge Function
│   │
│   └── migrations/                    Numbered, idempotent — paste into SQL Editor
│       ├── 007_family_foundation.sql        Tables + RLS + helpers for family system
│       ├── 008_family_auto_owner_trigger.sql  Auto-add creator as owner trigger
│       ├── 009_profiles_family_visibility.sql Profiles cross-family SELECT policy
│       └── 010_redeem_family_invite_rpc.sql   SECURITY DEFINER redemption fn
│
└── docs/
    ├── PROJECT_CONTEXT.md             What InvestIQ is, current architecture
    ├── LLM_HANDOFF.md                 Self-contained reference for handoff
    ├── CODE_MAP.md                    THIS FILE
    ├── ARCHITECTURE.md                System diagram + data flow
    ├── SCALING.md                     Capacity + bottlenecks + future-proofing
    ├── ROLES.md                       Working agreement (you + me)
    ├── TODO.md                        Prioritised action list
    ├── SELF_CHECK.md                  Pre-commit checklist
    ├── GUARDRAILS.md                  NZ FMA compliance + output contracts
    └── MODEL_SELECTION.md             Haiku/Sonnet/Opus rationale
```

---

## Frontend — `standalone/index.html` (7,556 lines)

Single-page vanilla JS + Tailwind CDN + Chart.js + Supabase JS client.

### Top section: HTML structure (~lines 1–1990)

| Region | What it is |
|---|---|
| `<head>` | Title, meta, FontAwesome + Google Fonts + Chart.js + Supabase JS CDN, full inline CSS (~1,200 lines incl. mobile @media block) |
| `#toastContainer` | Non-blocking notification dock (bottom-right) |
| `#familyInviteBanner` | Gradient strip shown when URL has `?family_invite=<token>` |
| `#authGate` | Full-screen sign-in page when user is signed out |
| `<nav>` | Top bar — logo, Refresh, AI Agents, Admin badge, Settings gear |
| `#mainLayout` | `.sidebar` (Overview/Holdings/Performance/Market/Insights/Watchlist/News/Tax/Dividends/Admin nav) + `<main>` |
| `#section-overview` through `#section-admin` | All 10 page sections, hidden/shown by `showSection()` |
| Modals | `#addModal` (Add/Edit holding), `#viewModal` (Holding detail page — chart + lots + AI + news), `#settingsModal`, `#agentsModal`, `#connectionsModal`, `#authModal`, `#quotaExhaustedModal` |
| `#mobileTabBar` | Bottom nav on phones (Overview/Holdings/Perf/Market/AI/Add) |

### Bottom section: `<script>` block (~lines 1991–7501)

Hundreds of functions. Grouped by purpose:

**Toast IIFE** — `toast.success/error/info/warning(message, duration)` — line ~2020

**proxyHeaders()** — adds X-Proxy-Secret based on priority: `_userProfile.proxy_secret` > `state.settings.proxySecret` > `PLATFORM_CONFIG.proxySecret` (the last is blank by design)

**Snapshot history** — `recordDailySnapshot()`, `loadSnapshotHistory()`, `viewSnapshotByDate()`, `loadSnapshotChart()` (the Performance chart with benchmark overlay)

**Watchlist** — `addToWatchlist()`, `refreshWatchlist()`, `renderWatchlist()`, `POPULAR_TICKERS`, `fetchYahooSearch()` for typeahead

**Holding Detail page (v0.5)** — `viewHolding(id)`, `setHoldingChartRange(period)`, `renderHoldingChart()`, `loadHoldingNews()`, `runHoldingAI()`, plus the `_currentHoldingId` / `_holdingChartObj` globals

**Benchmark overlay (v0.5)** — `BENCHMARK_DEFS`, `_benchmarksEnabled`, `fetchBenchmarkHistory()`, `_normaliseToPct()`, `toggleBenchmark()`, `setSnapshotRange()`, `setSnapshotMode()`

**News & Daily Brief (v0.4)** — `HEADLINE_SOURCE_DEFS`, `loadHeadlines()`, `renderHeadlines()`, `toggleHeadlineSource()`, `generateDailyBrief()`, plus existing `loadNews()` for per-ticker

**Family platform (v0.7a)** — `FAMILY_ROLE_DEFS`, `renderFamilySection()`, `loadFamilyMembers()`, `createFamilyPrompt()`, `inviteFamilyMemberPrompt()`, `generateFamilyInviteCode()`, `redeemFamilyInvite()`, `acceptFamilyInviteFromBanner()`, `checkFamilyInviteOnLoad()`

**Plan placeholder (v0.7a)** — `PLAN_DEFS`, `renderPlanSection()`

**Settings** — `populateSettingsForm()`, `saveSettings()`, `toggleApiKeyVisibility()`, `clearAllData()`

**Admin diagnostic tools** — `adminTestSupabase()`, `adminTestProxy()`, `adminTestDigest()`, `adminHealDuplicates()`, `adminFixTickers()`, `adminForceReload()`, `adminClearCloudRow()`, `loadAdminData()`, `loadActivityLog()`, `adminApproveUser()`, `adminRotateProxySecret()`, `adminAdjustQuota()`, `adminToggleAdmin()`, `adminDeleteUser()`

**Section opener** — `showSection(name, el)` — switches the visible `#section-*` div + fires section-specific loaders (loadAdminData, loadHeadlines, etc.)

**Modals** — `openModal(id)` / `closeModal(id)` — single-modal-at-a-time policy, Escape-key dismisses

**Init** — `async function init()` at the very end + the Supabase auth listener. Fires on `DOMContentLoaded`.

**Auto-refresh loop** — `setInterval(refreshAll, 5*60*1000)` plus 60s sync indicator + 14m proxy keep-alive ping.

---

## Frontend modules — `standalone/js/*.js` (1,755 lines across 8 files)

Loaded via `<script src>` tags in `index.html` *before* the inline `<script>`. Each module is a classic (non-ES-module) script — top-level `let`/`const` share global scope. Forward refs to inline functions resolve lazily at call time.

### `00-config.js` (65 lines)
**Pure constants. No DOM, no network. Always loads first.**

- `PLATFORM_CONFIG` — Supabase URL, anon key (designed public — RLS enforces security), Render proxy URL, admin emails allow-list, proxy secret (blank — admin override only), AI provider settings
- `CURRENCY_SYMBOLS` — NZD/USD/GBP/EUR/INR/AED/SGD/AUD lookup
- `ASSET_COLORS` — type → hex colour map (stock indigo, ETF blue, crypto amber, bond green, fund teal, kiwisaver violet, etc.)
- `CORS_PROXIES` — fallback list when our proxy is unreachable
- `LOCAL_ONLY_SETTINGS` — array of setting keys that *never* sync to cloud (claudeApiKey, supabaseUrl/Key, akahuTokens, aiProviderUrl/Key, proxySecret)
- `IDLE_LIMIT_MS` / `IDLE_WARNING_MS` — 30min auto-logout, 2min warn

### `10-helpers.js` (76 lines)
**Pure utility functions. No state mutation, no network.**

- `uuid()` — random ID for holdings/lots
- `fmt(n, dec=2)` — number → fixed-dec string, '–' for null/NaN
- `fmtCurrency(n, currency)` — adds symbol + K/M shorthand
- `fmtChange(n)` — colour-coded gain/loss span
- `getTagClass(type)` — CSS class for asset-type chip
- `_escape(s)` — full HTML-escape (`&<>"'`)
- `esc(s)` — single-quote escape (for `onclick='...'` attrs)
- `timeSince(date)` — friendly "5m ago" / "2h ago" / "3d ago"
- `validateUrl(url, label, requireHttps?)` — returns null if OK, error string if bad
- `maskSupabaseKey(key)` — first 12 + last 4 chars for display

### `20-state.js` (68 lines)
**Global app state + localStorage persistence.**

- `state` object: `{ portfolio, settings, marketData, agentResults, allocMode, perfMode }`
- `applyPlatformDefaults()` — fills empty platform creds from PLATFORM_CONFIG
- `loadState()` — reads `localStorage.investiq_v2`, migrates legacy schema, restores FX rates
- `saveState()` — writes to localStorage (claudeApiKey stripped), triggers debounced `scheduleSupa()`

### `30-cloud.js` (165 lines)
**Supabase init + cloud sync.**

- Globals: `_supabase`, `_supaUser`, `_savePending`
- `initSupabase()` — creates client from `state.settings.supabaseUrl/Key`
- `loadFromSupabase()` — reads `investiq_portfolios` row, diagnostic logging for dup keys, staleness guard (skip if local is newer), preserves `LOCAL_ONLY_SETTINGS` on merge
- `saveToSupabase()` — strips local-only settings, defensive dedup, upserts portfolio row
- `scheduleSupa()` — 2s debounced trigger of saveToSupabase

### `40-auth.js` (161 lines)
**Auth gate UI + idle session timeout.**

- `updateAuthUI()` — toggles sign-in badge, hides admin UI unless `_isAdmin`
- `_gateMode`, `switchGateTab()`, `submitGateAuth()` — form handlers for the auth gate
- `_lastActivity`, `_idleWarned`, `_activityThrottle`, `recordActivity()`, `checkIdle()` — 30-min idle auto-logout with 2-min warn toast
- Auto-installs `click/key/scroll/mousemove` listeners at module load to track activity

### `50-portfolio.js` (414 lines)
**Portfolio math + FX + market refresh.**

- `consolidatePortfolio(holdings)` — merges legacy `purchasePrice/quantity` into `lots[]`
- `autoNormalizeTickers(silent)` — runs `normaliseSymbol` on every holding, force-refresh prices
- `healDuplicates(silent)` — 2-pass: merge duplicate holdings + collapse near-duplicate lots
- `getFxRate(from, to)` — direct + inverse + via-USD with `state.marketData.fx` cache
- `getHoldingBasis(h)` — weighted-avg cost basis from `lots[]`
- `isPenceQuoted(symbol)` — true for `.L` / `.IL` tickers (Yahoo uses pence not pounds)
- `getMetrics()` — returns `{ holdings, totalValue, totalCost, totalGain, totalGainPct, totalDayChange, ignoredValue }` — all FX-converted
- `calcDiversificationScore(metrics)` — 0-100 based on types × platforms × sectors × concentration
- `MARKET_SYMBOLS` — indices / commodities / crypto / FX ticker map (consumed by `refreshMarketData`)
- `fetchYahooQuotes(symbols)` — proxy-first then CORS fallback chain
- `refreshMarketData()` — bulk fetch of MARKET_SYMBOLS → populates `state.marketData`
- `refreshPortfolioAndPrices()` — sequential: FX first then prices
- `refreshPortfolioPrices()` — fetches all holding symbols, skips `MANUAL_TYPES = {cash, fund, kiwisaver, realestate}` (v0.6 — these use manual prices)

### `60-import.js` (376 lines)
**CSV import + ticker normalisation + eToro demo.**

- `loadEtoroHoldings()` — one-shot demo: 60 eToro positions hardcoded
- `parseCSVLine(line)` — handles quoted CSV with escapes
- `CRYPTO_ALIAS` — `{ BTC: 'BTC-USD', ETH: 'ETH-USD', … }` map
- `normaliseSymbol(sym, type)` — uppercase + crypto alias + LSE suffix sanity
- `_importInProgress` — re-entrancy lock
- `importCSV(event)` — wrapper that owns the lock; defers to `_importCSVImpl`
- `_importCSVImpl(event)` — 182-line CSV handler: 5MB size cap, header detection, smart merge (case-insensitive platform), snapshot-on-import with custom date, "Replace all" toggle, eToro alias auto-fix
- `downloadCSVTemplate()` — generates `investiq-holdings-template.csv` with worked examples

### `70-ai.js` (421 lines)
**Multi-agent Claude pipeline + agent UI.**

- `AGENT_DEFS` — 4 agents (portfolio Haiku, market Haiku, opportunity Haiku, advisor Opus) with system prompts + maxTokens. Plus one-shot agents `brief` (Daily Brief) and `analyse` (per-holding) injected on demand.
- `callClaude(agentKey, userMessage)` — proxy POST with auto-retry on 429 (reads retry-after header, max 60s wait, single retry)
- `runAgents()` — orchestrator: slim payload (top 20 + aggregates), 4s stagger between phase-1 agents, Opus advisor synthesises, errors update UI per-agent
- `setAgentState(key, state, text?)` — idle/running/done/error per-card state machine
- `renderInsightsSection(results)` — renders the cards
- `updateScoreRing(score)` — top-left circular score widget
- `refreshSidebarScore(metrics)` — diversification-only score when no AI results
- `formatMarkdown(text)` — minimal Markdown → HTML (bold, lists, paragraphs)

---

## Proxy — `claude_proxy.py` (1,000 lines)

Python `BaseHTTPRequestHandler`-based proxy. Runs on Render Starter ($7/mo).

### Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | none | Keepalive ping (free, no cold-start exposure) |
| GET | `/api/diag` | none | Public auth-handshake diagnostic. Returns *received headers* + *proxy env config* + *would-authorise outcome*. Never leaks secret values, only masks |
| GET | `/api/market` | required | Bulk Yahoo quotes for `MARKET_SYMBOLS` + portfolio tickers |
| GET | `/api/market?symbols=X,Y,Z` | required | Targeted Yahoo quotes for specific tickers |
| GET | `/api/news?symbols=…&limit=N` | required | Per-ticker news via yfinance.Ticker.news |
| GET | `/api/headlines?sources=…` | required | Multi-source RSS aggregator (RNZ, Stuff, NZ Herald, BBC, MarketWatch, CNBC, Investing, Guardian). Parallel fetch via ThreadPoolExecutor, 6s/feed timeout, dedupe by URL, RFC822+ISO8601 date parsing, 15-min cache |
| GET | `/api/search?q=…` | required | Yahoo ticker search typeahead (used by watchlist picker) |
| GET | `/api/history?symbol=X&period=1y` | required | Daily OHLC for one ticker. LSE-pence normalised. 30-min cache. Used by Holding Detail chart + benchmark overlay |
| POST | `/v1/messages` | required | Anthropic Claude proxy. Uses platform `ANTHROPIC_API_KEY` env if caller's `x-api-key` is missing |
| POST | `/api/akahu` | required | NZ open banking (ANZ, BNZ, Sharesies) — not actively used, paid tier required |
| POST | `/api/agents` | required | Server-side multi-agent (unused — frontend orchestrates) |

### Auth model — `_check_secret()`

Accepts EITHER:
1. **Global** — `X-Proxy-Secret` header matches Render env var `PROXY_SECRET`. Used by the admin (you) when paste-into-Settings or for cron-style calls.
2. **Per-user** — `X-Proxy-Secret` matches some user's `profiles.proxy_secret` (validated via Supabase RPC `validate_proxy_secret`, 60s cached). Used by regular users; their secret is provisioned by admin clicking `↻ Secret` on their row.

On failure, sets `_auth_fail_reason` (`no_header` / `rpc_reject` / `proxy_supabase_misconfigured` / `unknown`) and `_forbidden()` returns a structured 403 with a hint.

### Env vars (set in Render dashboard)

| Var | Purpose |
|---|---|
| `PORT` | Render auto-sets to 8080 |
| `ALLOWED_ORIGIN` | CORS allow-list, comma-separated. `*` for dev |
| `PROXY_SECRET` | Admin global override secret (32-char hex) |
| `SUPABASE_URL` | For per-user secret RPC lookup |
| `SUPABASE_ANON_KEY` | Same |
| `RATE_LIMIT` | N requests/min/IP, default 60 |
| `ANTHROPIC_API_KEY` | Platform Claude key (used when caller has no `x-api-key`) |

### Caching

- In-memory `_cache` dict, per (endpoint, params).
- TTLs: market 5min, prices 1min, headlines 15min, news 30min, search 5min, history 30min.

### Rate limiting

Per-IP token bucket via deque (200-entry window). Default 60 req/min. Returns 429 with `retry-after` if exceeded.

---

## Supabase Edge Functions — `supabase/functions/*/`

Deno + TypeScript. Each function is one `index.ts` file.

### `weekly-digest/index.ts` (260 lines)

Sends Monday-morning portfolio digest emails via Resend.

**Trigger:** pg_cron scheduled `0 18 * * 0` UTC (6 AM Mon NZ).

**Flow:**
1. Reads `auth.users` joined with `profiles` where `digest_opt_in = true`
2. For each user: fetches latest snapshot + ~7-day-old snapshot from `investiq_snapshots`
3. Computes: total value, week change, top mover, worst mover, holdings count
4. Renders styled HTML email
5. Sends via Resend API
6. Returns `{ ran_at, attempted, sent, failed, details }`

**Auth:** custom `X-Cron-Secret` header (chose this over Verify-JWT to coexist with the gateway). pg_cron passes the secret; admin Test Digest button also uses it.

**Env:** `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `CRON_SECRET`, `SUPABASE_URL` (auto), `SUPABASE_SERVICE_ROLE_KEY` (auto).

### `weekly-digest/setup.sql` (73 lines)

One-time setup file the user pastes into SQL Editor:
- Adds `digest_opt_in` + `digest_last_sent` columns to `profiles`
- Enables `pg_cron` + `pg_net` extensions
- Schedules the cron job. **Has placeholders** for `<YOUR_CRON_SECRET_HERE>` and `<YOUR_SUPABASE_ANON_KEY>` to fill in before pasting.

### `family-invite/index.ts` (191 lines)

Sends family-invite emails via Resend. Called by frontend after a `family_invites` row has been INSERTed.

**Auth:** Verify-JWT ON (the caller's Supabase JWT proves who sent it — different model from weekly-digest).

**Flow:**
1. Verifies caller's JWT, gets `auth.users.id`
2. Looks up the `family_invites` row by ID (must have `invited_by = caller`)
3. Looks up family name + inviter's display name
4. Builds accept URL: `https://investiq-nz.netlify.app?family_invite=<token>`
5. Sends styled email with both magic-link AND the 6-char code
6. Returns `{ ok, sent_to, code, expires }`

**Env:** `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `APP_URL` (optional override of Netlify URL), `SUPABASE_URL` (auto), `SUPABASE_SERVICE_ROLE_KEY` (auto).

---

## SQL Migrations — `supabase/migrations/`

Numbered, idempotent. Paste each into Supabase Dashboard SQL Editor → Run. Safe to re-run.

Migrations 001–006 are historical — they happened before this docs refresh; their effects are baked into the current schema. Listed here only for completeness:

| Migration | What it created (historical) |
|---|---|
| ~001 | `investiq_portfolios` table |
| ~002 | `investiq_snapshots` table |
| ~003 | `profiles` table + signup trigger |
| ~004 | `is_admin()` SECURITY DEFINER helper |
| ~005 | RLS policies for the above |
| ~006 | `investiq_activity_log` table |

### `007_family_foundation.sql` (216 lines)

The big one. Establishes the family platform.

- **profiles** columns added: `active_family_id`, `plan_tier` (free/pro/family/admin with CHECK), `display_name`
- **families** table: id, name, created_by, created_at
- **family_members** table: family_id + user_id composite PK, role (owner/adult/teen/child/viewer with CHECK), display_name, joined_at, invited_by
- **family_invites** table: family_id, invited_by, email (nullable), role, token (48-char hex), code (6-char hex upper), expires_at (7d default), used_at, used_by
- **Helper functions** (all SECURITY DEFINER, all SET search_path = public):
  - `is_family_member(fam_id)` → boolean
  - `my_family_role(fam_id)` → text ('' if not a member)
  - `can_view_user(target_user_id)` → boolean (hierarchical: yourself + adults see all family)
- **RLS policies** on all three new tables (member-can-see / owner-can-modify pattern)
- **Cross-table policies** added: `investiq_portfolios` + `investiq_snapshots` get a family-aware SELECT policy using `can_view_user`

### `008_family_auto_owner_trigger.sql` (53 lines)

Fixes the RLS chicken-and-egg on family creation.

- `families.created_by` gets `DEFAULT auth.uid()` — client doesn't need to pass it
- Trigger `family_auto_owner` AFTER INSERT on families: auto-inserts the creator as `'owner'` in `family_members` (idempotent via `ON CONFLICT DO NOTHING`)
- Loosens `families_select` policy: also allows `created_by = auth.uid()` (defensive — covers the SELECT-back race)

### `009_profiles_family_visibility.sql` (29 lines)

Adds a second SELECT policy on `profiles` using `can_view_user(id)` so adults can read fellow family members' email + display_name (needed for the member-list UI). Teens/children/viewers still see only their own row.

### `010_redeem_family_invite_rpc.sql` (107 lines)

Single SECURITY DEFINER function `redeem_family_invite(p_token, p_code)`:

1. Looks up invite by token OR code (case-folds code with `upper(trim())`)
2. Validates: not used, not expired, email match (if email-restricted)
3. Inserts `family_members` row for caller with the invited role
4. Marks invite `used_at = NOW(), used_by = caller`
5. Returns JSON: `{ ok, family_id, family_name, role, error?, already_in? }`

Granted `EXECUTE` to `authenticated` role. The function is the only legitimate path for a non-member to read a `family_invites` row.

---

## Infrastructure configs

### `netlify.toml`

Build config. Publishes `/standalone` as the site root. No build step (static HTML+JS).

### `render.yaml`

Render Blueprint for one-click service creation. Defines the `investiq-proxy` web service running `python claude_proxy.py` with env vars referenced (values set in dashboard).

---

## What's NOT in the repo (lives elsewhere)

| Where | What |
|---|---|
| **Supabase Dashboard** | Tables, RLS policies (defined via SQL above but visible there), Edge Functions deployed (we paste source from `supabase/functions/`), Function secrets, pg_cron schedules, Auth settings, email templates |
| **Render Dashboard** | env vars (`PROXY_SECRET`, `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ALLOWED_ORIGIN`, `RATE_LIMIT`), build logs, deploy events |
| **Netlify Dashboard** | Custom domain (`investiq-nz.netlify.app`), deploy history, build minutes |
| **Resend Dashboard** | API key, From address, send logs |
| **Anthropic Console** | API key (`ANTHROPIC_API_KEY`), usage + spend, rate limits |
| **Your password manager / scratch note** | `PROXY_SECRET` value, `CRON_SECRET` value, Resend API key |
| **`localStorage` in your browser** | `investiq_v2` JSON (full state), `investiq_updated_at` timestamp, Supabase session token |
| **`webapp/` folder** | Abandoned Next.js code — `.gitignore`d but exists in git history. Not used. Don't delete from history without explicit OK |

---

## When this doc gets updated

- New file added to repo
- File deleted from repo (mark as removed, keep entry for one release for searchability)
- A function changes purpose meaningfully (rename or scope change)
- A migration is added
- A new Edge Function is added
- Always: incrementally, in the same commit as the code change that triggered it.
