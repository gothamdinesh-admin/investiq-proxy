# InvestIQ — Prioritised Action Plan

_Last revisited: 2026-04-19 · Paid plans now active (Supabase Pro · Render Starter · Netlify Pro)_

This is the single source of truth for what's next. Priority order is intentional — do P0 first, then P1 top-down.

---

## 🚨 P0 — Verify & harden what just shipped

The recent barrage of fixes needs user verification before building more on top.

- [ ] **Verify LSE pence fix** — open Holdings, find `AZN.L`, `CPI.L` or other `.L` tickers. Return % should be realistic (not +14389%). If still wrong, dump that holding's raw `lots[]` via Admin → Test Supabase R/W and we'll dig deeper.
- [ ] **Verify crypto dedup** — Admin Panel → Fix Crypto Tickers → then Force Reload from Cloud. Should see one `BTC-USD` row, not two. Total holdings count should equal unique symbols.
- [ ] **Verify admin badge gating** — log in as a regular test user (not gothamdinesh@gmail.com). ADMIN pill should NOT appear. Sidebar Admin Panel link should NOT appear. Settings modal should NOT show the orange "Admin · Platform Config" section.
- [ ] **Verify snapshot time-travel** — Performance → Holdings at a specific date → today should appear with per-holding breakdown. Tomorrow a second date appears.
- [ ] **Run the full self-check** in `docs/SELF_CHECK.md` before any new feature work.

---

## 🎯 P1 — High-value features (pick 2–3 for next session)

### For NZ investors (your target market — these are the moat)

- [ ] **Dividend tracking** — log dividend payments per holding, show YTD dividend income, project annual. Critical for NZ investors who use FIF alternative (CV method); also unlocks imputation-credit tracking. Est: half day.
- [ ] **Tax loss harvesting suggestions** — scan holdings for unrealised losses that could offset FIF-method income. NZ-specific, Sharesight charges for this. Est: half day.
- [ ] **FIF method comparison** — already have FDR 5% estimate. Add the Comparative Value (CV) method — some users end up with a LOWER tax bill under CV. Show both, flag which is better. Est: 2 hours.

### Killer UX upgrade

- [ ] **Holding detail page** — click any holding → full-screen view with:
  - 1-year Yahoo price chart (already have the data pipe via /api/market)
  - Complete lot history with per-lot P&L
  - Per-holding AI analysis button (uses existing Claude setup, runs single agent per holding)
  - Related news headlines (needs a news proxy endpoint)
  - Est: full day.

### Retention & engagement

- [ ] **Benchmark overlay on performance chart** — NZX 50 and S&P 500 lines plotted against your portfolio % return. Every serious investor expects this. Needs historical index data — Yahoo has `^NZ50` and `^GSPC` already. Est: 3 hours.
- [ ] **Price alerts** — "NVDA drops 5%, email me." Uses Supabase scheduled function (now available on Pro). Est: half day.
- [ ] **Weekly email digest** — Sunday morning summary: YTD return, biggest movers, upcoming dividends, FIF threshold alert. Supabase scheduled function + Resend API. Est: half day.

---

## ⚡ P2 — Polish & data quality

- [ ] **Multi-portfolio support** — "Personal / Retirement / Test" switcher. Mandatory for SaaS, blocker for several other features. Est: half day.
- [ ] **Transaction history / audit log** — every add/edit/delete logged with timestamp + user + old/new values. Needed for tax prep and debugging. Est: half day.
- [ ] **Bulk edit holdings** — select multiple rows, apply same change (currency, sector, platform, delete). Est: 2 hours.
- [ ] **Manual price override per holding** — lets user set price when Yahoo returns garbage (e.g. delisted or tiny-cap tickers). Est: 1 hour.
- [x] **"Ignore this holding" toggle** — DONE 2026-04-19. Row button + view modal button + Hide-ignored filter + Total Value subtitle. Excludes from totals.
- [ ] **Ticker autocomplete on Add Holding** — search Yahoo as user types. Est: 2 hours.
- [ ] **Holdings grouping toggle** — by platform / by sector / by country / by asset type. Already partially there for platform. Est: 2 hours.
- [ ] **Per-holding notes/tags** — freeform + taggable ("long-term", "speculative", "dividend", etc). Est: 2 hours.

---

## 💰 P3 — Commercialisation (once core UX is solid)

- [ ] **Plan tiers** — Free (1 portfolio, 20 holdings, own API key) vs Pro ($5-10/mo, unlimited, platform Claude key, advanced features).
- [ ] **Stripe integration** — monthly subscription, billing portal, plan changes.
- [ ] **2FA login + session timeout** — Supabase Auth supports both natively, just wire up.
- [ ] **Password recovery email flow** — Supabase Auth, needs email template.
- [ ] **Public read-only share links** — admin sends accountant a URL, they see portfolio without login.
- [ ] **Referral program** — invite 3 friends → 3 months free. Uses a `referrals` table + code generation.
- [ ] **Public demo mode** — sample portfolio visible without signup → conversion hook.

---

## 🧠 P4 — AI & intelligence

- [ ] **LM Studio / Ollama integration testing** — infrastructure is ready (`aiProvider: 'openai-compatible'` in Settings). Need to actually test with a local model via ngrok tunnel. Est: 1 hour to test + document.
- [ ] **AI chat interface** — natural-language portfolio Q&A ("what's my tech exposure?", "should I rebalance?"). Uses existing Claude setup with conversation history. Est: half day.
- [ ] **Custom agent creation** — admin can define new agent types with custom prompts. Est: 2 hours.
- [ ] **AI-written rebalancing plan** — "you're 65% tech, target 40% — sell X shares of NVDA, buy Y of VT." Complements the Opportunity Scout agent. Est: 3 hours.
- [x] **News feed for your holdings** — DONE 2026-04-19. New `/api/news` proxy endpoint (yfinance), News tab with scope filter (all / portfolio / watchlist / movers >2%), card layout with thumbnails, server-cached 30 min.
- [ ] **News summarisation with Claude Haiku** — next step: feed the headlines through Haiku for a 3-bullet daily briefing. Est: 1 hour on top of existing news feed.
- [ ] **Prompt caching** — cache the agent system prompts + portfolio context. Cuts AI cost 50-80%. Est: 1 hour.

---

## 🏗️ P5 — Infrastructure (paid-plan unlocks)

Now that you're paying for Supabase Pro, Render Starter, and Netlify Pro, these become worth doing.

- [ ] **Migrate proxy to Supabase Edge Functions** — kill Render entirely, run everything on Supabase. Three TypeScript functions: `claude`, `market`, `akahu`. No cold starts, no keep-alive, one platform. Est: half day.
- [ ] **Move Claude API key to Supabase Vault** — true server-side secret, users never see it, even admins can't leak it via Settings UI. Est: 1 hour.
- [ ] **Supabase Storage for attachments** — users can attach brokerage statements / screenshots to holdings. Est: half day.
- [ ] **Netlify Forms for feedback** — in-app "Report a bug" / "Feature request" form → hits Netlify Forms endpoint → you get email. Est: 30 min.
- [ ] **Deploy previews per PR** — Netlify Pro gives this free. Just enable in settings. Est: 5 min.
- [ ] **Rate limiting on proxy** — per-user token bucket, prevents abuse when site goes public. Est: 2 hours.
- [x] **Audit log** — DONE 2026-04-19. New `investiq_activity_log` table, logs login/signup/logout/csv_import/holding_*/agent_run with details. Admin Panel has Activity Log card with type filter.

---

## 📱 P6 — Mobile & accessibility

- [ ] **PWA (add to homescreen)** — installable, offline cache, icon on phone. Est: 2 hours.
- [ ] **Push notifications via PWA** — price alerts, dividend payments. Needs service worker. Est: half day.
- [ ] **Mobile responsive final pass** — I know there are still some rough edges, especially the holdings table on narrow screens. Est: 3 hours.
- [ ] **Keyboard shortcuts** — Cmd+K for search, Cmd+/ for help overlay, Esc to close modals. Est: 2 hours.
- [ ] **Screen reader support** — proper ARIA labels, focus management in modals, sr-only text for icon buttons. Est: 3 hours.

---

## 📤 P7 — Integrations & exports

- [ ] **PDF export / monthly report** — polished statement for sharing with accountant/advisor. Uses `jsPDF`. Est: half day.
- [ ] **Google Sheets export** — live-syncing tab via Google Sheets API. Est: half day.
- [ ] **Sharesight-format CSV export** — for users migrating or dual-tracking. Est: 2 hours.
- [ ] **Xero export** — NZ accountants love Xero. Est: half day.
- [ ] **Apple Stocks / Google Finance CSV import** — more on-ramps. Est: 2 hours.
- [ ] **Akahu paid tier evaluation** — $150-300/mo. ANZ/BNZ/Sharesies live sync. Decision needed: is it worth the running cost given most users will still prefer CSV? Est: decision, not a task.

---

## 🐛 P8 — Known bugs / nits

- [ ] Yahoo Finance CORS fallbacks (`corsproxy.io`, `allorigins.win`) throw console errors when Render is cold — cosmetic noise only. Remove once proxy is Render Starter / Edge Functions (no cold starts).
- [ ] Validation on Settings save — warn if Supabase URL is malformed, proxy URL unreachable.
- [ ] Pulse strip doesn't elegantly handle portfolios where all holdings are missing live prices.
- [ ] Some Akahu investment accounts return `holdings` endpoint as 403 on personal tier — surface this clearly in the sync flow.
- [ ] Delete the `webapp/` folder entirely — abandoned Next.js code, already gitignored but lives in history.

---

## ✅ Recently completed (for future session context)

### Reliability / data quality
- [x] LSE pence normalisation for .L / .IL tickers (AZN.L no longer +14389%)
- [x] Fix Crypto Tickers with collision merge (BTC → BTC-USD de-duplicates)
- [x] Admin badge race condition (non-admins never see ADMIN pill flash)
- [x] Self-healing duplicate check (two-pass — holdings + lots within holding)
- [x] Defensive dedup in saveToSupabase (never writes duplicate keys)
- [x] Cache staleness guard (local-newer-than-cloud → push local up)
- [x] Holdings at a specific date (snapshot time-travel view)
- [x] **Auto-normalize tickers on EVERY load** (BTC won't keep coming back from cloud)
- [x] **updateAdminVisibility() function** (was missing — fixed admin panel disappearance)
- [x] **Cache hygiene on signOut/signIn** (multi-user safe — no data leak between sessions)
- [x] **Manual force-sync button** + sync indicator pill in header (☁ Just now / 5m ago)
- [x] **Ignore holding toggle** (row + view modal + Hide-ignored filter + count subtitle)

### Features shipped
- [x] Supabase auth + login gate + admin panel with role bootstrap
- [x] Per-user cloud sync with RLS (profiles, portfolios, snapshots)
- [x] Platform-managed credentials (PLATFORM_CONFIG)
- [x] Multi-agent AI (Haiku + Sonnet ×2 parallel → Opus synthesiser)
- [x] Daily portfolio snapshots + performance chart with time ranges
- [x] CSV import with smart merge, snapshot date, replace-all option
- [x] Watchlist (track tickers without owning)
- [x] NZ FIF tax check with FDR estimate
- [x] Onboarding wizard for new signups (CSV / Manual / Demo / Skip)
- [x] LM Studio / OpenAI-compatible provider infrastructure (needs test)
- [x] Toast notifications replacing alert()
- [x] Sortable & searchable holdings table
- [x] Portfolio score without running agents (diversification-based)
- [x] Skeleton loaders
- [x] Crypto ticker alias auto-fix on import
- [x] Rich hover tooltips on holdings
- [x] Sanity cap on "best performer" (no more +14389%)
- [x] Admin diagnostic tools (Test Supabase, Test Proxy, Fix Duplicates,
      Fix Crypto Tickers, Force Reload, Reset Cloud Portfolio)

### Infrastructure
- [x] git → GitHub → Netlify + Render auto-deploy pipeline
- [x] Proxy PROXY_SECRET auth (prevents abuse of Claude key)
- [x] Supabase RLS policies for profiles, investiq_portfolios, investiq_snapshots
- [x] `is_admin()` SECURITY DEFINER function (fixes recursion)
- [x] Paid plans activated: Supabase Pro · Render Starter · Netlify Pro

---

## 📝 Session handoff protocol

When picking up a new session:
1. Read `docs/PROJECT_CONTEXT.md` first
2. Check P0 items are verified — don't build on broken foundation
3. Pick 2–3 P1 items (user's call)
4. Work through `docs/SELF_CHECK.md` before committing
5. Update this file's "Recently completed" section

---

## 🎯 Suggested next session picks

If you want maximum impact per hour:

**"NZ moat" package (half day):** Dividend tracking + Tax loss harvesting + FIF CV method
→ Builds on existing data, zero new infra, huge differentiation vs Sharesight.

**"Killer feature" package (full day):** Holding detail page with chart + lot history + per-holding AI
→ Makes the app feel complete. Turns browsers into users.

**"Polish + emails" package (half day):** Weekly email digest + price alerts + PWA installable
→ Retention multiplier. People open the app more.

**"Kill Render" package (half day):** Migrate proxy to Supabase Edge Functions
→ One fewer moving part, no cold starts, simpler ops story forever.
