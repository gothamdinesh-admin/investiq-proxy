# InvestIQ — Project Context

_Last updated: 2026-04-18_
_Read this first in any new session. Tells you what exists, why, and what's next._

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
| Piece | Why |
|---|---|
| Netlify | Free HTML hosting → real URL, not `file://` |
| Render (Python proxy) | Browser CORS blocks direct Claude/Yahoo calls → proxy sits in the middle |
| Supabase | Per-user auth + cross-device data sync + RLS for privacy |
| Anthropic | The AI brain for the 4 agents |
| Yahoo Finance (yfinance) | Free live prices for stocks/ETFs/crypto/FX |
| Akahu | NZ open banking — connects ANZ/BNZ/Sharesies (optional, user hasn't configured yet) |

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

## 5. What's implemented (as of 2026-04-18)

- [x] Standalone dashboard on Netlify with dark UI, 5 sections (Overview/Holdings/Performance/Market/Insights)
- [x] Python proxy deployed to Render (`claude_proxy.py`) — auto keep-alive ping every 14 min to prevent sleep
- [x] Live Yahoo Finance prices via `yfinance` bulk download
- [x] NZD as default base currency, FX auto-conversion via USDNZD=X etc.
- [x] CSV import with multi-column aliasing (eToro "Open Rate", `invested` ÷ qty fallback)
- [x] CSV template download with commented examples showing weighted avg cost
- [x] Two import modes: "Add lots" (new purchases) vs "Sync (update)" (daily update)
- [x] Weighted average cost basis via `lots[]` array per holding
- [x] Per-holding columns in table: Units / Avg Cost / **Invested** / Current Price / Mkt Value / P&L
- [x] Supabase auth + cloud sync + login gate (blocks app until signed in if Supabase is configured)
- [x] Per-user data isolation via Row Level Security
- [x] Admin panel — nav link visible only to `is_admin` users; shows all users, holdings count, role toggles, delete
- [x] Multi-agent AI: portfolio (Haiku) + market (Sonnet) + opportunity (Sonnet) in parallel, then advisor (Opus) synthesiser
- [x] JSON backup/restore for portability
- [x] Ticker bar — slowed to 120s + pause on hover
- [x] Proxy status dot in header (green = online, red = down)

## 6. What's pending / known issues

- [ ] Akahu tokens not configured by user → ANZ/BNZ/Sharesies sync inactive
- [ ] Render free tier still cold-starts on very first request of the day (keep-alive fires every 14 min, but initial boot after weekend may be slow)
- [ ] FMA regulatory wording — agents should use "analysis/observation", never "recommendation/advice" (see GUARDRAILS.md)
- [ ] Next.js app (unused) still in repo — can be deleted
- [ ] No rate limiting in proxy — fine for single user, must add before commercialising
- [ ] No export/email report functionality
- [ ] Mobile layout not optimised

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
