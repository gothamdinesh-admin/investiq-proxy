# Architecture — System Shape & Data Flow

_How the pieces fit together. Read this when you need to understand "what talks to what" before changing it._

Last updated: 2026-05-16 · v0.7a-family-foundation

---

## High-level system

```
                          ┌─────────────────┐
                          │  User's Browser │
                          │                 │
                          │  investiq-nz.   │
                          │  netlify.app    │
                          └────────┬────────┘
                                   │
       ┌───────────────────────────┼───────────────────────────┐
       │ Auth + DB direct          │ /api/* + /v1/messages     │ Yahoo
       │ (JS Supabase client)      │ (proxy)                   │ direct
       ▼                           ▼                           │ (CORS
┌──────────────┐         ┌─────────────────┐                   │ fallback
│  SUPABASE    │         │  RENDER         │                   │ only)
│  (Pro $25/mo)│         │  (Starter $7/mo)│                   │
│              │         │                 │                   │
│ • Auth       │         │ claude_proxy.py │                   │
│ • Postgres   │         │                 │                   │
│ • RLS        │         │ /api/market ────┼──► Yahoo (yfinance)│
│ • Storage    │         │ /api/headlines ─┼──► 8× RSS feeds   │
│ • Edge Fns:  │         │ /api/news ──────┼──► yfinance.news  │
│   weekly-    │         │ /api/search ────┼──► Yahoo search   │
│     digest   │         │ /api/history ───┼──► yfinance.hist  │
│   family-    │         │ /v1/messages ───┼──► Anthropic      │
│     invite   │         │ /api/diag       │                   │
│ • pg_cron    │         │ /health         │                   │
│ • pg_net     │         └─────────────────┘                   │
└──────┬───────┘                  │                            │
       │                          │                            │
       │ Edge Fns call            │                            │
       │   Resend API             │                            │
       ▼                          ▼                            ▼
┌──────────────┐         ┌─────────────────┐         ┌──────────────────┐
│   RESEND     │         │   ANTHROPIC     │         │  YAHOO FINANCE   │
│   (free 100  │         │   (pay-per-use) │         │  + 8 RSS sources │
│    /day)     │         │                 │         │  (free)          │
│ Transactional│         │ claude-haiku-4-5│         │ RNZ, Stuff, BBC, │
│ email send   │         │ claude-sonnet-..│         │ MarketWatch,     │
│              │         │ claude-opus-4-5 │         │ CNBC, etc.       │
└──────────────┘         └─────────────────┘         └──────────────────┘
                                                              ▲
                                                              │
                          ┌─────────────────┐                 │
                          │  AKAHU (NZ open │                 │
                          │  banking — not  │                 │
                          │  active, paid   │                 │
                          │  tier needed)   │                 │
                          └─────────────────┘                 │
                                                              │
                          ┌─────────────────┐                 │
                          │  corsproxy.io,  │                 │
                          │  allorigins.win │─────────────────┘
                          │  (free fallback │
                          │  when proxy is  │
                          │  unreachable)   │
                          └─────────────────┘
```

---

## Where each thing lives

| Layer | Hosted on | Role |
|---|---|---|
| **Frontend** (`standalone/`) | Netlify Pro | Static HTML+JS+CSS. Drag-drop or git-push deploy. Edge cache. |
| **Auth + DB** | Supabase Pro | Postgres 15. Auth via JWT. RLS enforces multi-tenancy. Edge Functions for scheduled jobs |
| **API proxy** (`claude_proxy.py`) | Render Starter | Python HTTPServer. Sole purpose: bypass browser CORS for Yahoo, hold the Anthropic key server-side, gate auth |
| **AI** | Anthropic API | Multi-agent — Haiku for cheap, Sonnet for balanced, Opus for synthesis |
| **Email** | Resend | Transactional sends. Free 100/day |
| **Market data** | Yahoo Finance (free) | Prices, indices, FX, news. Some via yfinance Python lib, some via direct HTTP |
| **News (multi-source)** | 8× RSS feeds | RNZ, Stuff, NZ Herald, BBC, MarketWatch, CNBC, Investing.com, Guardian |
| **NZ banking sync** | Akahu | Not active. Paid tier ($150-300/mo) for holdings-level sync |

---

## Sign-in flow

```
User opens https://investiq-nz.netlify.app
   │
   │ DOMContentLoaded
   ▼
init() in index.html
   │
   ├─► loadState()                    [reads localStorage.investiq_v2]
   │
   ├─► initSupabase()                 [creates _supabase client from PLATFORM_CONFIG]
   │
   ├─► _supabase.auth.getSession()
   │
   └─► IF session exists:
          _supaUser = session.user
          ├─► checkAdminStatus()      [SELECT profiles WHERE id = _supaUser.id
          │                           returns is_admin, is_approved, ai_*, proxy_secret,
          │                           digest_opt_in, plan_tier, active_family_id]
          ├─► updateAuthUI()          [hides authGate, shows badge + admin nav if admin]
          ├─► loadFromSupabase()      [reads investiq_portfolios for this user]
          │                           [staleness guard: if localStorage newer, skips]
          ├─► refreshMarketData()     [populates state.marketData.fx,
          │                           commodities, indices, crypto from /api/market]
          ├─► refreshPortfolioPrices()[/api/market?symbols=NVDA,GOOG,…]
          ├─► renderAll()             [getMetrics() → renders Overview, Holdings,
          │                           charts, sidebar, all visible sections]
          └─► recordDailySnapshot()   [INSERT into investiq_snapshots if today's missing]

       ELSE (no session):
          show #authGate
          [user enters email+password → signIn() → above flow runs]
```

**Defensive timeouts** wrap each `await` in signIn:
- Auth: 15s
- checkAdminStatus: 8s
- loadFromSupabase: 20s

If any times out, sign-in completes with a toast warning rather than hanging on "Please wait…".

---

## Price refresh cycle (every 5 minutes)

```
setInterval(refreshAll, 5*60*1000)
   │
   ▼
refreshAll()
   │
   ├─► refreshMarketData()
   │      │
   │      └─► fetchYahooQuotes(['^GSPC','^IXIC','BTC-USD','USDNZD=X', …])
   │              │
   │              ├─► TRY: GET /api/market?symbols=… on proxy
   │              │       └─► proxy hits yfinance bulk download, 5min cache
   │              └─► FALLBACK: corsproxy.io / allorigins.win → query1.finance.yahoo.com
   │
   ├─► refreshPortfolioPrices()
   │      │
   │      └─► same as above, with state.portfolio symbols.
   │          Skips MANUAL_TYPES = {cash, fund, kiwisaver, realestate}
   │          On success: writes h.currentPrice + h.dayChange + h.dayChangePct
   │
   ├─► refreshWatchlist().catch(() => {})  [non-fatal]
   │
   └─► renderAll()
         └─► getMetrics() → FX-converts everything to base currency, returns
             {totalValue, totalCost, totalGain, holdings[], …}
         → renderSummaryCards, renderHoldingsTable, renderCharts, etc.
```

---

## AI agents flow

```
User clicks "AI Agents → Run All"
   │
   ▼
runAgents()
   │
   ├─► tryConsumeAiQuota()           [check ai_usage_count vs ai_quota_max; admin bypass]
   │
   ├─► buildAgentPortfolioPayload()  [top 20 holdings verbatim + tail rolled up
   │                                  by (type, sector) — keeps prompt under 10k tokens]
   │
   ├─► Phase 1 — staggered 4s apart to spread token spend across the 60s window:
   │
   │      callClaude('portfolio',   baseMsg)     [Haiku · 800 tokens]
   │   →  callClaude('market',      baseMsg)     [Haiku · 800 tokens]
   │   →  callClaude('opportunity', baseMsg)     [Haiku · 800 tokens]
   │
   │      each → POST /v1/messages on proxy
   │           → proxy POSTs to api.anthropic.com with platform ANTHROPIC_API_KEY
   │              (or caller's x-api-key override)
   │           → 429 auto-retry once (reads retry-after header)
   │
   ├─► Promise.all waits for all three
   │
   ├─► Phase 2 — advisor synthesis:
   │      callClaude('advisor', allThreeOutputs) [Opus · 1200 tokens]
   │      → has its own rate limit pool (different model)
   │
   ├─► saveState() persists agentResults
   │
   └─► renderInsightsSection(results) → fills the four agent cards
```

**Token slim-down vs error case:**
- 107 holdings × 10 fields × 3 parallel Sonnet calls ≈ 12-15k input tokens in <1s
- Sonnet limit was 10k/min/org → 429
- Fix: top-20 + aggregates (saves ~70%) AND demote market+opportunity to Haiku (5× higher limit)
- See ROLES.md "two strikes and out" — this was a real one

---

## Family invite flow

```
ADULT in family clicks "Invite by email"
   │
   ├─► prompt(email, role)
   │
   ├─► INSERT into family_invites (token+code auto-generated by DB defaults)
   │      → returns {id, token, code, expires_at, …}
   │
   ├─► POST /functions/v1/family-invite with {invite_id}
   │      → Edge Function (Verify-JWT ON):
   │         - Decodes caller's JWT, verifies they own this invite
   │         - Looks up family name + inviter display name
   │         - Builds acceptUrl = https://investiq-nz.netlify.app?family_invite=<token>
   │         - POSTs to api.resend.com with HTML email
   │      → returns {ok, sent_to, code}
   │
   └─► toast.success or toast.warning("invite saved, email failed, share code: ABC123")

INVITEE clicks the link in email (or types the code)
   │
   ├─► Lands on investiq-nz.netlify.app?family_invite=<token>
   │
   ├─► init() detects ?family_invite= → shows top gradient banner
   │
   ├─► Banner has Accept button + Later button
   │
   ├─► User clicks Accept (if signed in) or signs in first then Accept
   │
   └─► redeemFamilyInvite({token})
         │
         └─► supabase.rpc('redeem_family_invite', {p_token, p_code})
                │
                └─► SECURITY DEFINER fn validates + INSERTs family_members + marks invite used
                    → returns {ok, family_id, family_name, role}
         │
         ├─► UPDATE profiles SET active_family_id = data.family_id
         └─► toast.success("Joined family X as adult")
```

---

## Weekly digest flow (Sunday 18:00 UTC)

```
pg_cron fires (defined in setup.sql)
   │
   └─► SELECT net.http_post(
         url = '…/functions/v1/weekly-digest',
         headers = jsonb_build_object(
           'Authorization', 'Bearer <SUPABASE_ANON_KEY>',
           'X-Cron-Secret', '<CRON_SECRET>',
           'Content-Type', 'application/json'
         ),
         body = '{}'
       )
   │
   ▼
weekly-digest Edge Function
   │
   ├─► CORS preflight OK (handles OPTIONS)
   │
   ├─► Validates X-Cron-Secret matches env var
   │
   ├─► SELECT profiles WHERE digest_opt_in = true AND is_approved = true
   │
   ├─► For each user:
   │      ├─► SELECT latest investiq_snapshots row for user
   │      ├─► SELECT snapshot from ~7 days ago
   │      ├─► Compute deltas + top/worst mover from breakdown.holdings[]
   │      ├─► Build HTML email
   │      └─► POST api.resend.com/emails
   │
   └─► Returns {ran_at, attempted, sent, failed, details[]}
```

---

## RLS — Row Level Security model

Every table has policies. **The default in Supabase is "no access" unless a policy grants it.**

| Table | Owner sees | Family adult sees | Family teen/child/viewer sees | Stranger sees |
|---|---|---|---|---|
| `profiles` | own row | all family members | own row only | (nothing — but the row exists) |
| `investiq_portfolios` | own row | all family members | own row | nothing |
| `investiq_snapshots` | own row | all family members | own row | nothing |
| `families` | created_by + members | members | members | nothing |
| `family_members` | own row + same-family rows | all family members | members | nothing |
| `family_invites` | invites you sent | adults+ in your family | nothing | nothing (RPC bypasses for redemption) |
| `investiq_activity_log` | own actions | (admin sees all) | own actions | nothing |

**Key helpers** (all SECURITY DEFINER, all in `public` schema):

- `is_admin()` — `_isAdmin` user can see all (admin override)
- `is_family_member(fam_id)` — pure family-roster check
- `my_family_role(fam_id)` — returns role string or empty
- `can_view_user(target_user_id)` — the hierarchical visibility predicate. Used by `profiles_family_select`, `portfolios_family_select`, `snapshots_family_select`. Resolves to: `target = self OR (target in shared family AND my_role IN ('owner','adult'))`

---

## Auth handshake — Proxy `/api/*`

```
Browser fetch(/api/market, headers: { X-Proxy-Secret: <secret>, … })
   │
   ▼
claude_proxy.py _check_secret()
   │
   ├─► incoming = headers['X-Proxy-Secret']
   │
   ├─► IF empty AND no env vars: dev mode → allow
   │
   ├─► IF PROXY_SECRET env var matches: admin-global → allow
   │
   ├─► ELSE call Supabase RPC validate_proxy_secret(incoming)
   │      → SELECT id FROM profiles WHERE proxy_secret = $1 AND is_approved = true
   │      → returns user_id or NULL
   │      [60-second cache to avoid hammering Supabase]
   │
   └─► If RPC returns user_id: allow. Else: _forbidden() with fail_reason
```

**Frontend priority for the `X-Proxy-Secret` header:**
1. `_userProfile.proxy_secret` (from Supabase profile, per-user)
2. `state.settings.proxySecret` (admin local override in Settings)
3. `PLATFORM_CONFIG.proxySecret` (baked into 00-config.js — currently blank)

---

## Deploy flow

```
git push origin main
   │
   ├─► GitHub fires webhooks
   │
   ├─► NETLIFY                                  RENDER
   │      │                                        │
   │      ├─► detects change in /standalone        ├─► detects change in claude_proxy.py
   │      ├─► no build step (static files)         ├─► installs requirements.txt
   │      ├─► uploads to CDN edge                  ├─► restarts Python process
   │      └─► live in ~30 sec                      └─► live in ~60-90 sec (cold start)
   │
   └─► Supabase Edge Functions DO NOT auto-deploy
          → must paste into Dashboard manually OR `supabase functions deploy <name>`
          → migrations DO NOT auto-run
          → must paste each .sql into SQL Editor manually
```

---

## Onboarding flow (first-time user)

```
Visitor lands on https://investiq-nz.netlify.app
   │
   ├─► IF localStorage.investiq_v2 missing AND no Supabase session:
   │      ├─► show #authGate
   │      ├─► Sign Up tab: email + password + confirm
   │      ├─► _supabase.auth.signUp() → Supabase sends confirmation email
   │      │   (custom template lives in Supabase Auth → Email Templates)
   │      ├─► User clicks email link → redirected back to app
   │      └─► onAuthStateChange fires → init flow runs
   │
   ├─► First-time signed-in user:
   │      ├─► Onboarding wizard (#onboardingModal) shows
   │      ├─► Options: CSV upload / Manual / Demo (eToro) / Skip
   │      └─► maybeShowOnboarding() sets state.settings.onboardingComplete = true
   │
   ├─► profiles row auto-created by Supabase signup trigger:
   │      ├─► is_approved = false (admin must approve)
   │      ├─► is_admin = false
   │      ├─► plan_tier = 'free'
   │      ├─► ai_quota_max = (default per migration)
   │
   └─► First-time admin (you, gothamdinesh@gmail.com) is auto-promoted
       on signup via bootstrap logic in checkAdminStatus()
```

---

## Snapshot system (Performance chart data source)

Every successful price refresh attempts a `recordDailySnapshot()` call. It:

1. Builds a snapshot row from current `state.portfolio` + computed metrics
2. Stores in `investiq_snapshots`: `user_id`, `snapshot_date` (YYYY-MM-DD), `total_value`, `total_cost`, `breakdown` (JSONB with per-holding values + prices + FX rates)
3. Idempotent — if today's row exists, skips (unless `force: true` from CSV-import path)

Performance chart (`loadSnapshotChart`) reads N days of snapshots, plots `total_value` vs `total_cost`. v0.5 added benchmark overlay that normalises both portfolio + benchmarks to % from baseline.

---

## When this doc gets updated

- New integration added (Stripe, Sentry, new market data source)
- A flow changes meaningfully (e.g. moving proxy from Render to Supabase Edge Functions)
- A new auth path is introduced
- New RLS policies or table relationships
- Always: incrementally, in the same commit that triggered the change.
