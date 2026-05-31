# InvestIQ — Mental Model

_Created: 2026-05-28 · The "get it in your head" doc. Read this first when picking up the codebase cold._

This is the architecture map. One picture, then the layers. Skip the rest of the docs until you've internalised this one.

---

## 1. The big picture

```
                        ┌──────────────────────────────────────┐
                        │  YOUR BROWSER (Netlify-hosted)        │
                        │  standalone/index.html + 14 JS mods   │
                        │  Tailwind CDN + Chart.js              │
                        └──────────────────────────────────────┘
                            │              │              │
              auth+data     │              │ AI calls     │ market data
                            ▼              ▼              ▼
              ┌─────────────────┐  ┌──────────────────┐  ┌──────────────┐
              │  SUPABASE PRO    │  │ RENDER STARTER   │  │ Yahoo / RSS   │
              │  Auth + Postgres │  │ claude_proxy.py  │  │ (via proxy)   │
              │  RLS + pg_cron   │  │ → Anthropic API  │  │               │
              │  Edge Functions  │  │ → Yahoo + news   │  │               │
              └─────────────────┘  └──────────────────┘  └──────────────┘
                            │
                            └─── pg_cron triggers 4 Edge Functions on schedule
                                  (weekly-digest, check-price-alerts,
                                   refresh-nz-funds, daily-backup)
```

Three external systems. Your app talks to **Supabase** for data + auth, **Render** for anything that needs a secret key (Claude API, Yahoo lookups), and the **browser's localStorage** for the live working copy. That's it.

---

## 2. The 15 "pages" are actually one HTML file

There are no separate pages. `standalone/index.html` has one big body with **15 `<section>` blocks**, all hidden except the active one. The sidebar nav just toggles which section is visible.

```
Sidebar nav (or mobile drawer)  ─▶  showSection('overview') etc.
                                    └─ hides all sections, shows one
                                    └─ calls that section's render fn
```

The 15 sections (and which JS module renders each):

| Section | Renderer lives in | What it shows |
|---|---|---|
| **overview** | inline + `50-portfolio.js` | Greeting, today's movers, top-5 holdings preview, KPI strip |
| **holdings** | `50-portfolio.js` | Full holdings table, Add/Edit, Holding Detail modal |
| **performance** | inline `<script>` | All-time/CAGR chart, heatmap, contribution view, benchmarks |
| **insights** | `70-ai.js` | 4 AI agents (Risk/Opportunity/Performance/Advisor) |
| **news** | `70-ai.js` + inline | Daily Brief (Claude), market headlines, your tickers |
| **market** | inline | Market Pulse — your exposure + indices/FX/crypto/commodities |
| **dividends** | inline | Dividend ledger with NZ tax fields |
| **tax** | inline | FIF check + FIF Method Optimiser (FDR vs CV) |
| **trader** | `80-trader.js` | TraderIQ — trade log + setups |
| **goals** | `90-goals.js` | Goals & Targets |
| **calendar** | `85-calendar-reports.js` | Upcoming dividends + events |
| **reports** | `85-calendar-reports.js` | PDF export, monthly statements |
| **family** | inline | Multi-member household aggregate |
| **watchlist** | inline | Tickers you don't own yet |
| **admin** | inline | Diagnostics, recovery tools, settings |

---

## 3. The 14 JS modules — what each one owns

They load **in numeric order** before the inline script. Earlier modules define stuff; later modules and the inline script use it. Forward refs (where later code is called from earlier code) are resolved lazily at call time.

```
00-config.js          PLATFORM_CONFIG, LOCAL_ONLY_SETTINGS — the constants
10-helpers.js         fmtNZ(), fmtPct(), toast(), date utils — pure functions
20-state.js           state = {portfolio, settings, ...}, loadState, saveState,
                      _pushAutoBackup, restoreFromAutoBackup
                      ── this is your in-memory model
30-cloud.js           initSupabase, loadFromSupabase, saveToSupabase,
                      scheduleSupa (debounced 2s)
                      ── empty-save guard lives here
40-auth.js            sign-in, sign-up, sign-out flows (uses Supabase Auth)
45-auth-security.js   _getFreshJwt, MFA enrol/verify (currently OFF),
                      friendlyAuthError, password reset
50-portfolio.js       Holdings rendering, Add/Edit modal, refresh prices,
                      Holding Detail modal, consolidatePortfolio (dedupe)
60-import.js          CSV import (Sharesies/eToro/Hatch/manual formats)
70-ai.js              callClaude(), AGENT_DEFS, 4-agent fan-out, Daily Brief
80-trader.js          TraderIQ section
85-calendar-reports.js Calendar + Reports + PDF export
88-onboarding-tour.js First-run tour (desktop + mobile tracks)
90-goals.js           Goals & Targets
95-integrations.js    Akahu / future integrations scaffold
```

The inline `<script>` in `index.html` is the glue: nav routing, section toggles, modals, theme, sign-out, and everything that touches the DOM-as-mounted.

---

## 4. The data flow (single most important diagram)

```
USER ADDS A HOLDING
        │
        ▼
 50-portfolio.js  saveHolding()
        │
        ▼
 20-state.js     state.portfolio.push(holding)
                 saveState()  ────► localStorage 'investiq_v2'
                              ────► _pushAutoBackup()  ──► 'investiq_autobackup'
                              ────► scheduleSupa()  (2s debounce)
                                          │
                                          ▼
                              30-cloud.js  saveToSupabase()
                                  ├── empty-save GUARD
                                  ├── dedupe by symbol::platform
                                  └── upsert investiq_portfolios row
                                          │
                                          ▼
                              SUPABASE  RLS: user_id = auth.uid()
                                          │
                                          ▼
                              localStorage 'investiq_last_good_save'
                                  {at, count}  ← save-health marker
```

**Reading it back on another device:**

```
Sign in  ─▶  40-auth.js  ─▶  loadFromSupabase()
                                  ├── staleness check (local newer? push instead)
                                  ├── consolidatePortfolio (dedupe again)
                                  └── state.portfolio = cloud data
                                        │
                                        ▼
                              render every section
```

---

## 4b. Multi-portfolio model (v0.21)

A user can have several named portfolios (Personal / Retirement / Test). The trick that kept this from touching 111 files:

```
state.portfolios = [{ id, name, holdings:[...] }]   ← real data
state.activePortfolioId = '<id>'                     ← which is active
state.portfolio   ← ACCESSOR (getter/setter) → active portfolio's holdings
```

Every existing `state.portfolio` reference transparently reads/writes the **active** portfolio. Switching is a pure-state flip + repaint (`renderAll()` + re-open current section) — no network. The header switcher (`renderPortfolioSwitcher`) does switch / create / rename / delete. Cloud stores the whole envelope in `investiq_portfolios.portfolios` (migration 016), and keeps the legacy `portfolio` column = active holdings so the 4 Edge Functions + snapshots keep working. **v0.21a limitation:** daily snapshots reflect whichever portfolio was active at snapshot time (per-portfolio history lands in v0.21b).

---

## 5. Where state actually lives

| Layer | Key | Lifetime |
|---|---|---|
| In-memory | `state` object (in `20-state.js`) — now `portfolios[]` + active accessor | While tab is open |
| Local | `localStorage.investiq_v2` | Until cache cleared |
| Local backup | `localStorage.investiq_autobackup` | Last 3 non-empty (survives sign-out) |
| Cloud live | `investiq_portfolios` table | Forever, source of truth |
| Cloud history | `investiq_snapshots` table | Daily, 1 row per holding per day |
| Cloud DR | Supabase Storage `backups` bucket | 30-day rolling JSON dumps |

---

## 6. The 5 background jobs (Supabase Edge Functions)

These run on pg_cron schedules — you never invoke them, they just tick. All gated by `X-Cron-Secret`.

| Function | When | Does |
|---|---|---|
| `daily-backup` | 14:00 UTC daily | Dumps 8 tables → JSON → Storage bucket |
| `refresh-nz-funds` | 14:00 UTC daily | Unique fund prices → updates all users' rows + notifies on fail |
| `check-price-alerts` | Every 30 min | Reads active alerts → fetches prices → emails via Resend |
| `weekly-digest` | Weekly | Pulls latest + 7d-old snapshot → emails styled summary |
| `family-invite` | On-demand | Sends invite email (the only non-cron one) |

---

## 7. The handoff cheat-sheet

If you only remember 5 things:

1. **One HTML file. 15 sections. Sidebar toggles which is visible.**
2. **Modules load in numeric order.** Lower numbers = primitives, higher numbers = features. Inline `<script>` is the glue.
3. **`state` is god.** Every UI render reads from `state`. Every write goes through `saveState()` which fans out to local + autobackup + cloud.
4. **The proxy holds the Claude key.** Browser never sees it. That's why `claude_proxy.py` on Render exists.
5. **RLS is the security boundary.** Every row has a `user_id`. Supabase enforces "you can only read/write your own rows" at the database level — there's no app-level auth check to bypass.

---

## 8. Where to go next

- Architecture deep-dive: `docs/ARCHITECTURE.md`
- Every file + function: `docs/CODE_MAP.md`
- Auth & data-safety: `docs/AUTH_DATA_SAFETY.md`
- Single-source LLM handoff: `docs/LLM_HANDOFF.md`
- Current state snapshot: `docs/CHECKPOINT_v0.20.md`
- What's next: `docs/TODO.md`

Last reviewed: 2026-05-28.
