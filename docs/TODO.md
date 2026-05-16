# InvestIQ — Prioritised Action Plan

_Last revisited: 2026-05-15 · Paid plans now active (Supabase Pro · Render Starter · Netlify Pro)_

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

- [x] **Holding detail page** — DONE 2026-05-15. Click any holding → 880px modal with:
  4-card stat row (value/return/avg cost/today), 1y price chart with 1M/3M/6M/1Y/5Y range toggle (via new /api/history yfinance route), per-lot P&L table (each lot's individual gain $ + %), AI Deep-Dive card (Sonnet, ~220 words, 4 sections incl. stance), latest 5 news stories. Chart.js instance destroyed on modal close to prevent canvas leaks.

### Retention & engagement

- [x] **Benchmark overlay on performance chart** — DONE 2026-05-15. Performance tab now has 5 toggleable benchmarks: NZX 50, S&P 500, NASDAQ, FTSE 100, ASX 200 (NZX + S&P on by default). `% Return` mode normalises portfolio + benchmarks to start = 0% on a shared axis. `NZ$ Value` mode shows absolute (benchmarks hidden, incomparable). Meta line under the chart summarises: your return + delta vs each benchmark in percentage points.
- [ ] **Price alerts** — "NVDA drops 5%, email me." Uses Supabase scheduled function (now available on Pro). Est: half day.
- [x] **Weekly email digest** — DONE 2026-05-15. Supabase Edge Function (`supabase/functions/weekly-digest/`) pulls latest + 7-day-old snapshot, computes deltas + top/worst mover, sends styled HTML via Resend. Settings toggle wired to `profiles.digest_opt_in`. **Activation pending:** user must run `supabase functions deploy weekly-digest`, set RESEND_API_KEY / FROM_EMAIL / CRON_SECRET secrets, and run `setup.sql` for the pg_cron schedule.

---

## ⚡ P2 — Polish & data quality

- [ ] **Multi-portfolio support** — "Personal / Retirement / Test" switcher. Mandatory for SaaS, blocker for several other features. Est: half day.
- [ ] **Transaction history / audit log** — every add/edit/delete logged with timestamp + user + old/new values. Needed for tax prep and debugging. Est: half day.
- [ ] **Bulk edit holdings** — select multiple rows, apply same change (currency, sector, platform, delete). Est: 2 hours.
- [ ] **Manual price override per holding** — lets user set price when Yahoo returns garbage (e.g. delisted or tiny-cap tickers). Est: 1 hour.
- [x] **"Ignore this holding" toggle** — DONE 2026-04-19. Row button + view modal button + Hide-ignored filter + Total Value subtitle. Excludes from totals.
- [ ] **Ticker autocomplete on Add Holding** — search Yahoo as user types. Est: 2 hours. _(Partial: implemented on watchlist via `/api/search` proxy route + native datalist. Same pattern can be lifted into Add Holding modal next session.)_
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
- [x] **News summarisation with Claude Haiku — Daily Brief** — DONE 2026-05-15. New card at top of News tab. Reads top 20 headlines + user's top 10 holdings, Haiku returns 3 bullets ≤25 words each + sentiment line. Reuses callClaude with a per-call AGENT_DEFS entry. ~400 max-tokens, runs in <5s.
- [x] **Multi-source news aggregator** — DONE 2026-05-15. New `/api/headlines` proxy endpoint aggregates RSS from 8 reputable sources in parallel (RNZ Business, Stuff, NZ Herald, BBC, MarketWatch, CNBC, Investing.com, Guardian) using stdlib xml.etree — no extra Python dep. Deduped by URL, sorted newest-first, 15-min cache. Frontend has source-chip filter + NZ/Global region toggle.
- [ ] **Prompt caching** — cache the agent system prompts + portfolio context. Cuts AI cost 50-80%. Est: 1 hour.

---

## 🏗️ P5 — Infrastructure (paid-plan unlocks)

Now that you're paying for Supabase Pro, Render Starter, and Netlify Pro, these become worth doing.

- [ ] **Migrate proxy to Supabase Edge Functions** — kill Render entirely, run everything on Supabase. Three TypeScript functions: `claude`, `market`, `akahu`. No cold starts, no keep-alive, one platform. Est: half day.
- [ ] **Move Claude API key to Supabase Vault** — true server-side secret, users never see it, even admins can't leak it via Settings UI. Est: 1 hour.
- [ ] **Supabase Storage for attachments** — users can attach brokerage statements / screenshots to holdings. Est: half day.
- [ ] **Netlify Forms for feedback** — in-app "Report a bug" / "Feature request" form → hits Netlify Forms endpoint → you get email. Est: 30 min.
- [ ] **Deploy previews per PR** — Netlify Pro gives this free. Just enable in settings. Est: 5 min.
- [x] **Rate limiting on proxy** — DONE 2026-04-19. Per-IP token bucket via deque, default 60/min via RATE_LIMIT env var, returns 429.
- [x] **CORS allowlist + PROXY_SECRET enforcement** — DONE 2026-04-19. ALLOWED_ORIGIN env var, X-Proxy-Secret required on all non-public endpoints.
- [x] **CSV size cap (5MB) + POST body cap (2MB)** — DONE 2026-04-19.
- [x] **Idle session timeout (30 min) with 2-min warning** — DONE 2026-04-19.
- [x] **Settings URL validation** — DONE 2026-04-19. URL format check + sk-ant- prefix check on Claude key.
- [x] **Help / FAQ modal + 2-step welcome wizard** — DONE 2026-04-19.
- [x] **Audit log** — DONE 2026-04-19. New `investiq_activity_log` table, logs login/signup/logout/csv_import/holding_*/agent_run with details. Admin Panel has Activity Log card with type filter.

---

## 📱 P6 — Mobile & accessibility

- [ ] **PWA (add to homescreen)** — installable, offline cache, icon on phone. Est: 2 hours.
- [ ] **Push notifications via PWA** — price alerts, dividend payments. Needs service worker. Est: half day.
- [x] **Mobile responsive final pass** — DONE 2026-05-15. Pure-CSS @media block covers: 40px min tap targets, sticky portfolio summary with backdrop blur, holdings/FIF/watchlist tables → labelled card layouts under 768px, toast moved above mobile tab bar, charts capped 260px, iOS no-zoom inputs.
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

### 2026-05-16 session — Release v0.8c (UX/UI cleanup + light-mode rework)

User feedback: light mode looked bad, asked whether design choices
were research-backed. Honest answer: prior work applied general
UX principles (Hick's Law, F-pattern, progressive disclosure) but
not investment-app-specific research. This session: research-backed
UX doc + comprehensive light-mode rework.

**docs/UX_DESIGN.md (NEW)**
- [x] Research summary covering: loss aversion (Kahneman & Tversky),
      hyperbolic discounting, anchoring effect, endowment effect,
      choice overload (Iyengar & Lepper), Miller's 7±2.
- [x] Competitive analysis: Wealthsimple (calm pastels), Robinhood
      (gamification lessons learned), Sharesight (density), Hatch NZ
      (trust signals), Empower (dashboard-first).
- [x] Adopted principles: Calm > exciting, Story before stats,
      Glanceability, Progressive disclosure, Loss-aversion-aware,
      Trust signals, Variable rewards (gentle), Recognition over recall.
- [x] Visual hierarchy F-pattern documented.
- [x] Typography (Inter 14px body, JetBrains Mono for numbers).
- [x] 8px baseline spacing system documented.
- [x] Both colour palettes — dark + light — with WCAG-AAA-tested
      hex values. Light mode uses slate scale not pure black/white.
- [x] Asset type colors consistent across both modes (functional).
- [x] Component decisions: cards, buttons, inputs, tags, toasts, modals,
      charts. With rationale for each.
- [x] Empty-state copy for every section.
- [x] Micro-interactions (subtle hover lifts, theme transitions).
      EXPLICITLY no confetti / no slot-machine animations — Robinhood
      lesson called out.
- [x] Accessibility status + future research questions.

**Comprehensive theme variable system**
- [x] Expanded CSS variables from ~12 → ~25 cover all functional
      colors (semantic, not raw): bg / bg-panel / bg-panel-2 / bg-input
      / bg-deep / bg-hover / border / border-strong / text-primary /
      text-secondary / text-muted / text-inverted / accent + accent-soft /
      color-indigo / color-blue / color-green / color-red / color-amber /
      color-teal / color-violet / color-orange / chart-grid / chart-text /
      scrollbar.
- [x] Light mode tuned per research: slate-50 bg (not pure white),
      slate-900 text (not pure black), accents shifted to -600 variants
      (more saturated to compensate for white bg).
- [x] Inline-style override pattern: [data-theme="light"]
      [style*="color:#818cf8"] { color: var(--color-indigo) !important; }
      Catches the 200+ inline hex references throughout the file without
      needing to migrate each one. Pragmatic compromise.
- [x] Targeted overrides for nav, sidebar, metric-card, input (focus
      ring with accent-soft), table-row (hover bg), table-header, nav-link
      (active state), modal (subtle shadow in light), modal-overlay,
      neutral, btn-secondary/primary, pos/neg, all tag-{type} variants,
      badge-pos/neg/neutral, auth gate, mobile tab bar, skeleton loaders.
- [x] Hover state added to table-row in light mode (no equivalent in dark
      since the design was monochrome — light mode benefits from the lift).

### 2026-05-16 session — Release v0.8b (Overview decongestion + Theme)

User feedback: Overview holdings duplication felt crowded; wanted
psychological-design principles applied + dark/light mode toggle.

**Overview decongestion**
- [x] Removed full holdings table from Overview (was duplicating the
      Holdings tab). Replaced with "Top 5 holdings" preview card +
      'View all 60 →' CTA routing to Holdings tab.
- [x] holdingsCountLabel shows context: "· top 5 of 60"
- [x] New "Today's biggest moves" card: 3-card horizontal strip of
      holdings with day change ≥0.5%, sorted by absolute move. Each
      card is clickable → opens Holding Detail. Color-coded (green
      for gains, red for losses) with hover lift micro-animation.
      Hides entirely on days with no significant moves.

**Personalised greeting strip**
- [x] Time-aware: "Good morning" / "Good afternoon" / "Good evening" /
      "Working late" / "Late one" based on local hour.
- [x] First-name greeting from _userProfile.display_name → settings.name
      → email username → 'there' fallback.
- [x] Story-first sub-headline: "Your portfolio is +NZ\$285 today · up
      27.92% all-time" with green/red colour coding (not just numbers).
- [x] Right-side badges: holdings count + today's date (en-NZ locale).
- [x] Auto-hides when portfolio empty (no false dopamine).

**Light / Dark theme infrastructure**
- [x] CSS variables in :root: --bg, --bg-panel, --bg-panel-2, --bg-input,
      --border, --border-strong, --text-primary, --text-secondary,
      --text-muted, --accent, --scrollbar-bg/fg. Cover the highest-impact
      surfaces. Hard-coded hex still scattered elsewhere — incremental
      migration deferred.
- [x] [data-theme="light"] override block defines light palette
      (white + slate scale + indigo accent). Plus targeted overrides
      for nav, sidebar, metric-card, input, table-row, table-header,
      nav-link, modal, modal-overlay, neutral, btn-secondary, tag.
- [x] Theme toggle button in header (sun/moon icon). Click cycles
      light ↔ dark. Persists to localStorage 'investiq_theme' + cloud-
      synced via state.settings.theme.
- [x] loadInitialTheme() called in init() AFTER loadState() — so first
      paint matches user preference, no flash of wrong theme.
- [x] Toast confirms switch. Charts auto-redraw to pick up new colours.
- [x] body has 0.25s transition on background/color for smooth switch.

**Known light-mode rough edges (incremental fix-list)**
- Some inline `style="background:#0a1120"` etc. throughout don't pick up
  vars yet — visible mostly on dividend cards, alerts list, family roster.
- Chart.js tick + grid colors still hardcoded #4a6080 / #1a2540 —
  readable in both modes but could be tuned per-theme.
- Sentry / Resend test panels (admin) read OK but neutral grey on grey
  background in light mode is dull.

### 2026-05-16 session — Release v0.8a (Dividend tracking)

**NZ dividend ledger — biggest NZ-specific moat unlocked**
- [x] Migration 012_dividends.sql: new `dividends` table with NZ tax
      fields built in (withholding_tax for foreign source, imputation_credit
      for NZ companies, div_type covering cash/drip/special/return_of_capital/
      interest). RLS own-rows-only (tax data personal even within family).
      Indices on (user_id), (user_id, symbol), (user_id, pay_date).
      Auto-touching updated_at. SECURITY-INVOKER view dividends_ytd_summary
      pre-aggregates current-year totals by currency.
- [x] Frontend Dividends page (replaces 'coming soon' placeholder):
      4-card summary (total income, after-withholding, imputation credits,
      top payer) + filter row (period: YTD/last year/12mo/all + per-holding)
      + Add dividend button + CSV export button + full ledger table with
      type chips (color-coded by cash/drip/special/etc.).
- [x] Add/edit modal driven by showFormModal: symbol field with
      auto-fill picker from holdings, pay_date, ex_date, gross_amount,
      currency, withholding_tax, imputation_credit, div_type, platform,
      notes. Picking from the holdings dropdown auto-fills symbol +
      currency + platform on save.
- [x] Holding Detail modal: new 'Dividend' button (amber) opens the
      add-dividend modal pre-seeded with current holding's symbol +
      currency + platform — one-click per-holding dividend record.
- [x] CSV export: full ledger to investiq-dividends-YYYY-MM-DD.csv,
      headers match the DB columns for accountant / IR3 prep workflow.
- [x] Activity log entries: dividend_added, dividend_updated,
      dividend_deleted, dividends_exported.

**Activation pending (user runs):**
- Paste supabase/migrations/012_dividends.sql into SQL Editor

**Future (v0.8b):**
- IR3 line 17 export formatter (foreign-sourced dividends)
- Imputation credit reconciliation report
- Next-payment date forecast from history
- CSV import (eToro / Sharesies dividend exports)

### 2026-05-16 session — Pitch brief for Harbour + wider firms

- [x] `docs/PITCH_BRIEF.md` — 13-section strategic narrative covering:
      exec summary, what's built (status table), competitive moat vs
      Sharesight/Yahoo/Sheets/Hatch, architecture credibility, roadmap
      by horizon (90d / 90-180d / 180-365d), business model 3 paths
      (consumer freemium, B2B white-label, affiliate), why Harbour
      specifically (with 3-level partnership ask: pilot, white-label,
      strategic investment), wider TAM (NZ + AU expansion), AI moats
      over time (public → Vault → fine-tuned), honest risks, what
      to lift for different audiences (Harbour leadership / technical /
      consumer investors / conferences), open questions still figuring
      out (name/brand, solo-dev dependency, pricing precision).

Designed as source material — user pulls sections into slides /
leave-behinds / written pitches for different audiences. Not the
deck itself.

### 2026-05-16 session — End-to-end testing rule + portable CLAUDE.md

- [x] End-to-end testing now enshrined as MEMORY.md Behavioural Rule #2:
      "Pushed != working. Acceptable proof = code live + path clicked through +
      expected output observed. For backend changes build a diagnostic surface."
      Plus explicit regression-awareness clause.
- [x] Verified end-to-end on Sentry: Admin → Test Sentry button fires
      tagged event → user confirmed appears in sentry.io dashboard.
- [x] Verified end-to-end on C4 daily backup: user confirmed 'backups'
      bucket created in Supabase Storage.
- [x] NEW: CLAUDE.md at repo root — portable working-agreement doc
      Claude Code auto-loads every session. Has 10 sections:
        1. Roles (universal)
        2. Behavioural rules — safety-first, end-to-end, two strikes
        3. What I will NOT do without explicit OK
        4. What I WILL do autonomously
        5. Trust safeguards
        6. Communication shorthand
        7. Failure modes learned the hard way
        8. Doc-set pattern
        9. Release rhythm
        10. PROJECT-SPECIFIC section (template for other repos)
      User can copy + adapt for any future project.

### 2026-05-16 session — Release v0.7d (Hardening / Critical security fixes)

**Critical security work shipped**
- [x] C3 — Service-role key audit: verified zero exposure in tracked
      files. Only referenced via Deno.env in 3 Edge Functions where
      Supabase auto-injects it. No references in frontend, Python proxy,
      Render config, or migration SQL.
- [x] C4 — Daily DB backup Edge Function (`daily-backup`): service-role
      reads all 8 critical tables, serialises to JSON, uploads to private
      'backups' Storage bucket (auto-created if missing). 30-day retention
      with automatic pruning. Scheduled 14:00 UTC daily (2 AM NZ).
      Includes RESTORE.md playbook for: per-row, per-table, and full
      disaster-recovery scenarios.
- [x] C5 — Sentry error monitoring: SDK loaded from CDN, initialised in
      init() with sentryDsn from PLATFORM_CONFIG. Privacy-aware
      beforeSend hook strips email/user_id/IP from events. Ignores
      noisy non-actionable errors (ResizeObserver, cross-origin
      Script error, network blips). 10% tracesSampleRate. User signs up
      at sentry.io and pastes DSN into 00-config.js to activate.

**User-action items still outstanding**
- [ ] C1 — Anthropic spend cap. Console → Settings → Limits → monthly
      cap + alert at 80%. Recommended: $100 USD/month.
- [ ] C2 — Supabase + Netlify + Render billing alerts.
- [ ] C3 — Render dashboard env var check (confirm no SERVICE_ROLE_KEY).

### 2026-05-16 session — Security & Safety audit

**New doc + memory rule**
- [x] `docs/SECURITY.md` — comprehensive risk register across cyber / data /
      cost / compliance / operational / future-proofing dimensions. Lists 5
      Critical, 10 High, 10 Medium, 8 Acceptable risks. Plus a "what we
      have right" inventory + pre-change checklist + remediation calendar.
- [x] MEMORY.md updated with safety-first behavioural rule (now Rule #1,
      above the "two strikes and out" rule). Mandates 7-dimension audit
      before any non-trivial change.
- [x] PROJECT_CONTEXT.md + ROLES.md cross-reference SECURITY.md
- [x] Reality-check inventory: no real secrets found in tracked files
      (only placeholder text + .env in .gitignore + render.yaml uses
      sync:false for ANTHROPIC_API_KEY)

**Critical actions surfaced (do this week):**
- [ ] C1 — Anthropic spend cap (5 min, Console → Limits) — **user action**
- [ ] C2 — Supabase + Netlify billing alerts (10 min) — **user action**
- [x] C3 — Verify SUPABASE_SERVICE_ROLE_KEY not leaked anywhere — **DONE (clean — only Edge Functions reference it via Deno.env, never in code/git/Render config)**. User to confirm Render dashboard env vars don't include it.
- [x] C4 — Daily DB backup Edge Function — **DONE (v0.7d)**. Function + setup.sql + RESTORE.md shipped. User to deploy + run setup.sql.
- [x] C5 — Sentry frontend SDK integration — **DONE (v0.7d)**. SDK CDN script + initSentry() + PRIVACY-aware beforeSend hook. User to sign up at sentry.io and paste DSN into PLATFORM_CONFIG.sentryDsn.

### 2026-05-16 session — Release v0.7c (Price Alerts)

**Price Alerts foundation**
- [x] Migration 011_price_alerts.sql: new `price_alerts` table with scope
      (ticker/portfolio), condition (above/below/day_rise_pct/day_drop_pct),
      threshold, currency, cooldown_hours, fire_count tracking, RLS
      (own-rows-only), auth.uid() default on user_id.
- [x] Edge Function check-price-alerts: scheduled every 30 min via pg_cron.
      Reads all active off-cooldown alerts, batch-fetches current prices
      from Render `/api/market`, evaluates each condition, sends styled
      HTML email via Resend, marks last_fired_at + increments fire_count.
      X-Cron-Secret gate (same pattern as weekly-digest). Portfolio-scope
      alerts pull latest + prior investiq_snapshots for day-% calc.
- [x] Frontend Settings → Alerts section: list with toggle/edit/delete
      per alert, "+ New alert" button → modal with scope (Whole portfolio
      OR specific ticker dropdown from your holdings), condition select,
      threshold number, cooldown select (1h/6h/24h/3d/1w), optional note.
- [x] Holding Detail modal: new "Alert" button (amber, bell icon) opens
      the same modal pre-seeded with current symbol + currency + current
      price as the threshold placeholder.
- [x] Activity log entries: alert_created, alert_updated, alert_deleted.

**Activation pending (user runs):**
- Run migration 011_price_alerts.sql in Supabase SQL Editor
- Deploy check-price-alerts Edge Function via Dashboard (Verify JWT OFF)
- Set PROXY_URL + PROXY_SECRET secrets on the Edge Function
- Run check-price-alerts/setup.sql to schedule the cron

### 2026-05-16 session — Release v0.7b (Polished Family + Aggregate View)

**Reusable styled modals (replaces native prompt/confirm/alert)**
- [x] `#promptModal` HTML scaffold + `showFormModal({title, icon, description, fields, submitLabel})` Promise API
- [x] `showConfirm({title, description, danger})` for yes/no
- [x] `showInfo({title, body, actions})` for alerts with optional buttons
- [x] Escape key + close X resolve null (cancel) for any pending modal

**Family popup polish (no functional changes, pure UX)**
- [x] Create Family — styled modal with name field
- [x] Invite by email — single modal with email + role dropdown (was 2× prompt)
- [x] Generate code — styled modal with role select → styled code-display
      modal with Copy code / Copy link / Done actions
- [x] Enter invite code — styled modal with code field
- [x] Remove member / leave family — styled danger confirm
- [x] Revoke invite — styled danger confirm

**Aggregate household view (v0.7b)**
- [x] New "Family" nav link in sidebar (visible only when in 1+ families)
- [x] New `#section-family` with picker for multi-family + refresh + manage
- [x] `loadFamilyAggregateView()` fetches family roster + profile emails +
      each member's most-recent snapshot via RLS (adults see all, others
      see only themselves)
- [x] 4-card household summary: total value · return $ + % · members
      breakdown · total holdings
- [x] Allocation-by-member doughnut chart (Chart.js, role-coloured)
- [x] Per-member breakdown cards: role chip, value, % of household, return,
      top holding, last snapshot date
- [x] Privacy note for non-adult roles ("you only see your own data")
- [x] Empty-state guidance: "no snapshots yet, come back tomorrow"
- [x] Footer note clarifying FIF is per-person, links to manage members

### 2026-05-16 session — Documentation baseline

**Doc set refresh (v0.7-docs)**
- [x] `docs/ROLES.md` (NEW) — working agreement, trust safeguards, what I will / won't do without explicit OK
- [x] `docs/CODE_MAP.md` (NEW) — every file in the repo + what it does, every JS module's exports, every SQL migration's effect, every Edge Function's flow
- [x] `docs/ARCHITECTURE.md` (NEW) — system diagram (ASCII), sign-in flow, refresh cycle, AI agents flow, family invite flow, weekly digest flow, RLS model, auth handshake, deploy flow, onboarding flow, snapshot system
- [x] `docs/SCALING.md` (NEW) — capacity headroom per layer, what scales easily, what needs attention before growth, what's a problem only at real scale, future-proofing notes, 30-day improvement list, cost projection
- [x] `docs/PROJECT_CONTEXT.md` (refreshed) — front door doc, links to specialist docs, current state through v0.7a
- [x] `docs/LLM_HANDOFF.md` (delta added at top) — points to specialist docs, summarises v0.4 → v0.7a changes since original write

### 2026-05-15 session — Release v0.7a (Family Foundation)

**Family platform foundation (v0.7a)**
- [x] DB migration 007_family_foundation.sql: families, family_members,
      family_invites tables with hierarchical RLS. profiles extended with
      active_family_id, plan_tier ('free'/'pro'/'family'/'admin'),
      display_name.
- [x] SECURITY DEFINER helpers: is_family_member(fam_id),
      my_family_role(fam_id), can_view_user(target_user_id).
- [x] Cross-table RLS: adults in your family can SELECT your
      investiq_portfolios + investiq_snapshots rows via can_view_user().
      Teens/children/viewers only see their own.
- [x] Settings → Family section: create family, invite by email,
      generate 6-char code, member list with role chips, pending
      invites list with revoke + copy-link, member remove (owner) /
      leave (self), multi-family switcher.
- [x] Settings → Plan section: shows current tier with brand colours +
      perks list, disabled "Upgrade" button (paid plans deferred until
      50+ active users), info note when in 1+ families but on Free tier.
- [x] Inbound invite banner: page-load check for ?family_invite=<token>
      or ?family_invite_code=<code> → top gradient banner with Accept
      button → look up + join + clean URL.
- [x] Edge Function family-invite (Resend-backed email send), reuses
      existing RESEND_API_KEY secret. Requires Verify JWT ON (caller's
      identity authorises the send).

**Activation pending (user runs):**
- Paste supabase/migrations/007_family_foundation.sql into SQL Editor
- Deploy family-invite Edge Function via Dashboard (paste index.ts,
  leave Verify JWT ON)
- Set APP_URL secret if Netlify URL ever changes

**Pending v0.7b (aggregate view):**
- Family sidebar tab with combined household total
- Per-member breakdown cards with their value/return/top holding
- Family-aggregate AI digest

### 2026-05-15 session — Release v0.6 (NZ Funds & KiwiSaver)

**NZ-specific (v0.6)**
- [x] Fund-type holdings with manual unit prices — Harbour, Milford, Generate,
      Fisher Funds, Simplicity, Booster, Pathfinder, Pie, Kernel, InvestNow,
      SuperLife, ANZ, Westpac, ASB, BNZ, Mercer, AMP (and "Other")
- [x] KiwiSaver as a distinct asset type with its own colour + tag chip
- [x] Add Holding modal: dynamic fund-helper row (provider dropdown + unit
      price field) appears when type=fund/kiwisaver
- [x] Staleness indicator on holdings table: today/Nd ago / "Nd old"
      (yellow ≥7d) / "Nd stale" (red ≥14d) / "⚠ no price"
- [x] refreshPortfolioPrices skips fund/kiwisaver (no Yahoo lookup)
- [x] Holding Detail modal degrades gracefully for fund types: shows a
      "Manual price · N days ago" placeholder with quick Update button
      instead of a broken Yahoo chart; news section explains why Yahoo
      doesn't cover unit trusts and suggests checking provider's site
- [x] FIF check excludes fund/kiwisaver (NZ unit trusts are PIE-taxed,
      not FIF-taxed)
- [x] Auto-defaults on fund creation: currency=NZD, country=New Zealand

### 2026-05-15 session — Release v0.5 (Holding Detail + Benchmarks)

**Killer UX (v0.5)**
- [x] Holding Detail page — full modal with 1y chart, per-lot P&L, AI Deep-Dive, news
- [x] Benchmark overlay — NZX 50 / S&P 500 / NASDAQ / FTSE / ASX 200 on Performance chart
- [x] New /api/history proxy route (yfinance, LSE-pence normalised, 30-min cache)

### 2026-05-15 session — Release v0.4 (News + Brief)

**Architectural**
- [x] **JS modular split** — index.html went from ~7,170 → 5,720 lines. Eight self-contained files in `standalone/js/` (00-config, 10-helpers, 20-state, 30-cloud, 40-auth, 50-portfolio, 60-import, 70-ai) totalling ~1,728 lines. Each module pre-loaded via `<script src>` before the inline script; forward refs resolve lazily.

**News & Daily Brief**
- [x] Multi-source RSS aggregator (`/api/headlines` proxy route, 8 sources, parallel fetch, 15-min cache)
- [x] AI Daily Brief card (Haiku-summarised, 3 bullets + sentiment, runs against current portfolio)
- [x] News tab restructured: Daily Brief → Market Headlines (source chips + region filter) → Your Tickers

**Robustness / infrastructure**
- [x] Sign-in won't hang anymore — every Supabase await has a hard timeout (15s auth / 8s admin check / 20s portfolio load)
- [x] Proxy 403 diagnostic — new `/api/diag` endpoint + Admin → Test Proxy button shows the full auth handshake breakdown
- [x] Admin self-rotate proxy secret — fixed catch-22 where the first admin had no way to provision their own `profiles.proxy_secret`
- [x] FX rate persistence — `marketData.fx` now stored in localStorage so initial reload doesn't flash raw foreign-currency numbers
- [x] AI agents rate-limit handling — slim payload + 4s stagger + Haiku demotion for non-advisor agents + auto-retry on 429

**Watchlist**
- [x] Ticker typeahead picker — native `<datalist>` populated from user's portfolio + curated popular tickers + live Yahoo search via new `/api/search` proxy route
- [x] Watchlist refreshes alongside portfolio prices (was tab-open only)
- [x] Visible feedback toast on Add (avoids "doesn't do anything" silence)

**FIF tax**
- [x] Pence-quote bug fix — LSE tickers (.L / .IL) were showing 100× true value in FIF; now applies `isPenceQuoted` adjustment consistently with `getMetrics`
- [x] Recalculate button surfaces toast + flags holdings missing `country` field

**Dividends**
- [x] Section placeholder with proper "coming soon" copy (replaces dead nav link)

**AI ergonomics**
- [x] Modal-overlap fix when AI quota popup appears
- [x] Friendlier 429 error message tells user it's transient

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
