# InvestIQ — Project Context

_Front door for any new session. Read this first; the linked specialist docs go deeper._

Last updated: 2026-05-16 · v0.7a-family-foundation

---

## What InvestIQ is

A personal investment portfolio dashboard for **NZ-based retail investors**, now extending to **family/household platforms**. Single user signs up, tracks their multi-platform multi-currency portfolio, optionally invites family members under a hierarchical visibility model.

**Holdings spread across (real user):** eToro, Sharesies, Harbour Asset Management, Indus, ANZ NZ, BNZ. KiwiSaver supported as a holding type (manual unit prices for NZ funds Yahoo doesn't track).

**Goals:**
- Single pane of glass for a multi-platform, multi-currency portfolio
- Live market prices via Yahoo Finance (with CORS fallback chain)
- Multi-agent Claude AI analysis (4 agents, model per role: Haiku × 3 + Opus)
- NZD base currency with automatic FX conversion
- Weighted average cost basis tracking (multiple lots per ticker)
- Cloud sync across browsers/devices (Supabase)
- **NEW:** Family layer — hierarchical visibility (adults see kids, kids see own only), invite via email + 6-char code, 5 roles
- **NEW:** NZ Funds + KiwiSaver tracking with manual unit prices
- Eventually commercialisable as multi-tenant SaaS

---

## Hosting (all paid tiers active)

| Service | Plan | Cost | Role |
|---|---|---|---|
| Netlify | **Pro** | ~$19/mo | Static hosting + forms + edge functions + branch deploys (unused) |
| Render | **Starter** | $7/mo | Python proxy (`claude_proxy.py`) — no cold starts |
| Supabase | **Pro** | $25/mo | Auth, Postgres + RLS, Edge Functions, pg_cron, Storage |
| Resend | Free 100/day | $0 | Transactional emails (weekly digest + family invites) |
| Anthropic | Pay-per-use | varies | Claude API for agents — Haiku × 3 + Opus advisor |

**Total ~$51/mo USD flat. Scales nearly free up to ~200 users.** See `SCALING.md` for breakdown.

---

## Architecture summary

```
Browser (investiq-nz.netlify.app)
  ├── Direct → Supabase (auth + DB + Edge Functions)
  └── Through proxy → Render → Yahoo / Anthropic / 8× RSS feeds

Scheduled jobs:
  └── pg_cron (Supabase) → Edge Function → Resend → email user
```

Full diagram in `ARCHITECTURE.md`.

---

## Single-developer model + AI guide

This is a **solo project** built by one developer (gothamdinesh@gmail.com) with Claude as the technical guide. Roles + trust contract in `ROLES.md`. Short version: **you decide what to build, I propose how + execute + maintain quality**.

---

## Repo layout

```
C:\Users\gotha\Downloads\Personal Investments\
├── standalone/                    Frontend — drag to Netlify or git-push
│   ├── index.html                 (~7,500 lines: HTML + CSS + inline JS)
│   └── js/                        8 extracted modules (~1,800 lines)
├── claude_proxy.py                Python proxy (1,000 lines)
├── supabase/
│   ├── functions/                 Edge Functions (weekly-digest, family-invite)
│   └── migrations/                Numbered, idempotent SQL (007-010 so far)
├── docs/                          ← you are here
├── netlify.toml                   Netlify config (no build step)
└── render.yaml                    Render Blueprint for the proxy
```

Full file-by-file index in `CODE_MAP.md`.

---

## Current state — what's shipped

### Core portfolio
- Standalone dashboard on Netlify Pro
- Python proxy on Render Starter with auth (PROXY_SECRET + per-user secrets)
- Live Yahoo Finance prices via `yfinance` bulk download + CORS fallback chain
- NZD default base currency, FX auto-conversion (USDNZD, AUDNZD, GBPNZD, USDAUD)
- LSE pence normalisation (`.L` / `.IL` tickers ÷100)
- Weighted average cost basis via `lots[]` per holding
- 7-column Holdings table: Units / Avg Cost / Invested / Current Price / Mkt Value / P&L / Actions

### v0.4 — News & Daily Brief
- Multi-source RSS aggregator (`/api/headlines` — 8 sources)
- AI Daily Brief (Haiku, 3 bullets + sentiment)
- News tab restructured: Daily Brief → Multi-source headlines → Per-ticker

### v0.5 — Holding Detail + Benchmarks
- Holding Detail modal: 4-card stats + 1y chart + per-lot P&L + AI Deep-Dive + news
- Benchmark overlay: NZX 50 / S&P 500 / NASDAQ / FTSE / ASX 200
- `/api/history` proxy route (yfinance historical, LSE-pence normalised)

### v0.6 — NZ Funds & KiwiSaver
- Fund-type holdings with manual unit prices (18 NZ providers in dropdown)
- KiwiSaver distinct type with violet colour + own tag
- Staleness indicator on holdings table (today / Xd ago / 7d old / 14d stale)
- Holding Detail modal degrades gracefully for fund types
- FIF check excludes fund/kiwisaver (PIE-taxed, not FIF-taxed)

### v0.7a — Family Foundation
- Tables: `families`, `family_members`, `family_invites`
- 5 roles: owner / adult / teen / child / viewer
- Hierarchical RLS via `can_view_user()` helper
- Cross-table policies on `profiles`, `investiq_portfolios`, `investiq_snapshots`
- Settings → Family section with member list, invite controls, multi-family switcher
- Plan placeholder section (Free / Pro / Family — paywall deferred)
- Email invite via Resend (`family-invite` Edge Function)
- 6-char code invite for verbal sharing
- Atomic redemption via `redeem_family_invite()` RPC
- Auto-add creator as owner via trigger

### Weekly email digest (live)
- Supabase Edge Function `weekly-digest`
- Settings opt-in toggle
- Sunday 18:00 UTC cron (= 6 AM Mon NZ)
- Resend-delivered HTML email with week change + top mover

### Robustness shipped this session
- Sign-in defensive timeouts (no more "Please wait…" hang)
- Proxy 403 diagnostic (`/api/diag` + Admin → Test Proxy)
- Admin self-rotate proxy secret (fixed bootstrap catch-22)
- FX rate persistence in localStorage (no more flicker)
- AI agents rate-limit handling (slim payload + 4s stagger + Haiku demotion + auto-retry)
- Mobile UX pass (sticky summary, card-flow tables, 40px tap targets)
- JS modular split (8 files, 1,800 lines extracted from index.html)

---

## What's NOT built yet (priority order)

### Top-priority next (TODO.md)

- **v0.7a polish** — replace 5 `prompt()` / `confirm()` popups with styled modals (~2 hr)
- **v0.7b — Aggregate household view** — Family tab in sidebar with combined total + per-member breakdown cards (~half day)
- **Dividend tracking** — half day, NZ-specific moat
- **Tax loss harvesting** — half day, NZ-specific
- **FIF CV method** — alternative tax calc method
- **Price alerts** — Supabase Edge Function + per-user thresholds

### Infrastructure debt (SCALING.md)

- Anthropic spend cap
- Resend custom domain (avoid spam flag)
- Sentry frontend integration
- Migrate proxy to Supabase Edge Functions (kill Render)
- Daily DB backup Edge Function

---

## Tag history (release checkpoints)

`git tag -l` returns these — each is a known-good rollback point:

- `v0.4-news-brief` — Multi-source news + AI Daily Brief
- `v0.5-holding-detail-benchmarks` — Holding Detail page + Benchmark overlay
- `v0.6-nz-funds` — NZ Managed Funds & KiwiSaver
- `v0.7a-family-foundation` — Family platform foundation

To revert to a tag: `git checkout <tag>`. To compare: `git diff <tag>..HEAD`.

---

## How to navigate the docs

| Question | Start here |
|---|---|
| "What is this app?" | `PROJECT_CONTEXT.md` (you're here) |
| "How does it work technically?" | `ARCHITECTURE.md` |
| "Where is function X?" | `CODE_MAP.md` |
| "Will this scale to N users?" | `SCALING.md` |
| "What are the security/safety risks?" | `SECURITY.md` |
| "Who owns which decisions?" | `ROLES.md` |
| "What's next?" | `TODO.md` |
| "What should I check before committing?" | `SELF_CHECK.md` |
| "How should the AI agents word things?" | `GUARDRAILS.md` |
| "Why is this agent on Haiku vs Sonnet?" | `MODEL_SELECTION.md` |
| "Full self-contained handoff to a new LLM?" | `LLM_HANDOFF.md` |

---

## Session handoff protocol

When picking up a new session:
1. Read `PROJECT_CONTEXT.md` (this file) first
2. Read `ROLES.md` for the working agreement
3. Glance at `TODO.md` for current priorities
4. If touching a file, check `CODE_MAP.md` to understand its role
5. If touching architecture, read `ARCHITECTURE.md`
6. Before any commit, work through `SELF_CHECK.md`
7. After any meaningful change, update the docs that drift (especially `CODE_MAP.md` and `TODO.md`)

---

## User context — the real person

- Based in New Zealand
- Has investments via Harbour Asset Management
- Active multi-platform portfolio (eToro etc.)
- Solo developer building this for himself + considering family use + maybe SaaS later
- Working in PowerShell on Windows
- No CLI bias — happy to do Supabase dashboard work + drag-drop to Netlify
- "Pack the release" preference — fewer, more polished drops over many small commits
- "Finish before jumping" — close each item cleanly before starting next
- Wants trust + sync over speed
