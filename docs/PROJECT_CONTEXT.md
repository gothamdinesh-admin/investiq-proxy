# InvestIQ — Project Context

_Last updated: 2026-04-19_
_Read this first in any new session. Tells you what exists, why, and what's next._

**Hosting now on paid tiers:** Supabase Pro · Render Starter · Netlify Pro
(unlocks: Edge Functions, scheduled jobs, Vault, Storage, no cold starts, forms)

---

## 1. What InvestIQ is

A personal investment portfolio dashboard for a **NZ-based retail investor** (the user) with
holdings spread across **eToro, Sharesies, Harbour Investment Portal, Indus, ANZ NZ, BNZ**.

Goals:
- Single pane of glass for a multi-platform, multi-currency portfolio
- Live market prices via Yahoo Finance
- Multi-agent Claude AI analysis (4 agents, different models per role)
- NZD base currency with automatic FX conversion
- Weighted average cost basis tracking (multiple lots per ticker)
- Cloud sync across browsers/devices (Supabase)
- Eventually commercialisable as multi-tenant SaaS

---

## 2. Architecture (current, all cloud-hosted)

```
┌────────────────────────────────────────────────────────────┐
│                    USER'S BROWSER                           │
│  https://investiq-....netlify.app  (Netlify drag-drop)     │
│  One file: standalone/index.html  (~3500 lines, vanilla JS)│
└──────────┬─────────────────────────────────┬───────────────┘
           │ auth + data                     │ API calls
           ▼                                 ▼
    ┌──────────────┐                  ┌─────────────────────┐
    │   SUPABASE   │                  │   RENDER (Python)    │
    │              │                  │   claude_proxy.py    │
    │ • Auth       │                  │                      │
    │ • Profiles   │                  │ /v1/messages ────┐   │
    │ • Portfolios │                  │ /api/market      │   │
    │ • RLS        │                  │ /api/akahu       │   │
    └──────────────┘                  │ /api/agents      │   │
                                      │ /health          │   │
                                      └──────┬───────────┘   │
                                             │               │
                          ┌──────────────────┼───────────────┤
                          ▼                  ▼               ▼
                    Anthropic API    Yahoo Finance    Akahu (NZ open banking)
                    (Claude)         (yfinance pkg)   (ANZ, BNZ, Sharesies)
```

### Why each piece exists
| Piece | Plan | Why |
|---|---|---|
| Netlify | **Pro** | HTML hosting → real URL, not `file://`. Pro unlocks Forms, Edge Functions, deploy previews. |
| Render (Python proxy) | **Starter ($7/mo)** | Browser CORS blocks direct Claude/Yahoo calls. Starter = no cold starts. |
| Supabase | **Pro ($25/mo)** | Auth + per-user sync + RLS. Pro unlocks Edge Functions, scheduled jobs, Vault, Storage. |
| Anthropic | pay-per-use | AI brain for the 4 agents |
| Yahoo Finance (yfinance) | free | Live prices for stocks / ETFs / crypto / FX |
| Akahu | free tier | NZ open banking — `/accounts` works, `/holdings` paywalled. Not configured. |

---

## 3. File layout

```
C:\Users\gotha\Downloads\Personal Investments\
├── standalone/
│   └── index.html          ← THE WHOLE APP (~3500 lines, vanilla JS + Tailwind CDN)
├── proxy/
│   ├── claude_proxy.py     ← Python HTTP proxy (Render deploys this)
│   ├── requirements.txt    ← yfinance
│   └── render.yaml         ← Render auto-config
└── docs/
    ├── PROJECT_CONTEXT.md  ← this file
    ├── MODEL_SELECTION.md  ← which Claude model for which task
    └── GUARDRAILS.md       ← output rules + compliance + security
```

All changes go into `standalone/index.html`. Redeploy by drag-dropping the `standalone` folder onto Netlify.

---

## 4. Data model

### Holdings (state.portfolio)
```js
{
  id, symbol, name, type, platform, currency, sector, country, notes,
  currentPrice, dayChange, dayChangePct,
  lots: [ { quantity, price, date, note } ]    // one per purchase — enables weighted avg cost
}
```

The legacy single-purchase format (`purchasePrice`, `purchaseDate`, `quantity`) is auto-migrated
to `lots[]` on `loadState()`.

### Computed metrics — `getMetrics()`
For every holding:
```
avgBuyPrice  = Σ(lot.qty × lot.price) / Σ(lot.qty)     // weighted
costBasis    = quantity × avgBuyPrice                   // amount invested
currentValue = quantity × currentPrice                  // market value
gain         = currentValue - costBasis
gainPct      = gain / costBasis × 100
```
All values are FX-converted into `state.settings.currency` (default NZD).

### Settings (state.settings)
```js
{
  name, currency,           // user-facing
  claudeApiKey,             // local only — NEVER saved to Supabase
  proxyUrl,                 // Render URL
  supabaseUrl, supabaseKey, // supabase key saved local only
  akahuAppToken, akahuUserToken  // local only
}
```

### Supabase schema (already deployed)
- `investiq_portfolios` — one row per user with `portfolio`, `settings`, `agent_results` as JSONB
- `profiles` — `id, email, is_admin, created_at, last_seen`, auto-created by trigger on signup
- RLS: users see only their own row; admins (`is_admin=true`) can read all

---

## 5. What's implemented (as of 2026-04-19)

### Core portfolio
- [x] Standalone dashboard on Netlify Pro with dark UI, 8 sections: Overview, Holdings, Performance, Market, AI Insights, Watchlist, NZ Tax (FIF), Admin
- [x] Python proxy on Render Starter (no cold starts, PROXY_SECRET auth)
- [x] Live Yahoo Finance prices via `yfinance` bulk download
- [x] NZD default base currency, FX auto-conversion (USDNZD=X, AUDNZD=X, GBPNZD=X, USDAUD=X)
- [x] **LSE pence normalisation** — .L / .IL tickers auto-divided by 100 so AZN.L etc. show realistic returns
- [x] Weighted average cost basis via `lots[]` array per holding
- [x] Per-holding columns: Units / Avg Cost / Invested / Current Price / Mkt Value / P&L

### Import & data quality
- [x] Single-mode CSV import with smart merge (case-insensitive platform, symbol-only fallback)
- [x] Snapshot date picker on import (backfill historical states)
- [x] "Replace all" checkbox for clean-slate imports
- [x] CSV template with weighted-avg-cost examples
- [x] eToro column aliasing ("open rate", invested÷qty fallback)
- [x] Crypto ticker alias auto-fix (BTC → BTC-USD, ETH → ETH-USD, +18 more)
- [x] Admin "Fix Crypto Tickers" with collision merge (no more duplicate symbols)
- [x] Self-healing duplicate check on init (two-pass: holdings + lots within holdings)
- [x] Defensive dedup in saveToSupabase (never writes duplicate keys)
- [x] Cache staleness guard (local-newer-than-cloud → push local, not reverse)

### Cloud & auth
- [x] Supabase Pro auth + cloud sync + login gate
- [x] Per-user data isolation via Row Level Security
- [x] Platform-managed credentials (regular users never configure anything)
- [x] Admin panel — nav link visible only to `is_admin` users
- [x] Admin badge race fix (non-admins never see ADMIN pill flash)
- [x] Admin diagnostic tools: Test Supabase R/W, Test Proxy, Scan & Fix Duplicates, Fix Crypto Tickers, Force Reload, Reset Cloud Portfolio
- [x] Bootstrap logic: first signup auto-promoted to admin

### AI agents
- [x] Multi-agent: portfolio (Haiku) + market (Sonnet) + opportunity (Sonnet) in parallel, then advisor (Opus) synthesiser
- [x] LM Studio / OpenAI-compatible provider infrastructure (ready, not yet tested)

### UX polish
- [x] Toast notifications replacing alert() popups
- [x] Sortable columns + search/filter on Holdings table
- [x] Portfolio Pulse strip (your top movers, not a market ticker)
- [x] Skeleton loaders on first paint
- [x] Rich hover tooltips on holdings (lots, FX, native currency)
- [x] Portfolio score visible without running agents (diversification calc)
- [x] Sanity cap on "Best Performer" (excludes holdings with >500% gain)
- [x] Proxy status dot in header (green/red indicator)
- [x] Onboarding wizard for new signups (CSV / Manual / Demo / Skip)
- [x] Demo data loader (5 sample NZ-investor holdings)

### NZ-specific
- [x] NZ FIF tax check with FDR 5% method estimate
- [x] NZ$50k de-minimis threshold detection
- [x] FMA-compliant vocabulary (see GUARDRAILS.md)

### Snapshots & history
- [x] Daily portfolio snapshots to Supabase with full per-holding payload
- [x] Performance chart with time-range toggles (30d / 90d / 1y / All)
- [x] **Holdings at a specific date** — pick any snapshot date → see exact holdings then with units, cost, value, P&L
- [x] Snapshot-on-import with custom date

### Infrastructure
- [x] git → GitHub → Netlify + Render auto-deploy (both paid tiers now)
- [x] Supabase tables: profiles, investiq_portfolios, investiq_snapshots
- [x] `is_admin()` SECURITY DEFINER function (fixes recursion)
- [x] JSON backup/restore for portability
- [x] Watchlist (track tickers without owning)

## 6. What's pending / known issues

See `docs/TODO.md` for the full prioritised list. Top 5 blockers / opens:

- [ ] **P0 verification:** user needs to confirm LSE pence fix, crypto dedup, admin badge gating are all working live
- [ ] **Dividend tracking** (P1 NZ-specific moat) — biggest unshipped feature
- [ ] **Holding detail page** (P1 killer UX) — 1y chart, lot history, per-holding AI
- [ ] **Migrate proxy to Supabase Edge Functions** (P5, paid-plan unlock) — kills Render dependency
- [ ] **Weekly email digest** (P1, paid-plan unlock) — Supabase scheduled function

---

## 7. User workflow (for reference)

- Daily: visit Netlify URL → auto-login from saved session → see live prices
- Weekly: export eToro CSV → "Sync (update)" mode → quantities update, new lots added for top-ups
- Ad-hoc: click **AI Agents → Run All Agents** → 4 agents produce insights in ~20s total

---

## 8. Secrets the user has stored (for reference, not in repo)

- Anthropic API key (`sk-ant-…`) — in Settings modal + Render `ANTHROPIC_API_KEY` env var
- Supabase URL + anon key — in Settings modal
- Supabase account + created admin user (first signup was made admin via SQL)

---

## 9. Session handoff rules

When resuming a session, check:
1. Read this file + `MODEL_SELECTION.md` + `GUARDRAILS.md` first.
2. If user asks about a number or metric, trace it back to `getMetrics()` in `standalone/index.html`.
3. If user reports a data issue, check both localStorage (`investiq_v2`) and Supabase.
4. If user asks "why X didn't work" — nearly always: proxy cold start, CORS, or missing API key.
5. Every code change goes in `standalone/index.html`, then user drag-drops to Netlify.
