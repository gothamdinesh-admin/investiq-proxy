# InvestIQ — TODO / Checkpoint

_A running list of everything we've parked. Pick items from here when you're ready to keep building._

---

## 🎯 Currently open / needs user testing

- [ ] Verify the "cross-browser value-doubling" bug is fixed after the self-healing + defensive-dedup changes. Admin Panel → **Scan & Fix Duplicates** will show if anything slipped through.
- [ ] Test the admin diagnostic tools (Test Supabase R/W, Test Proxy, Scan & Fix, Force Reload, Reset Cloud) — each surfaces real errors with specific causes.
- [ ] Try the new onboarding wizard with a fresh signup.
- [ ] Try LM Studio integration tomorrow (see below).

## 🔴 Tomorrow — LM Studio connection

- [ ] **Set up LM Studio on PC** — download from lmstudio.ai, load a model (e.g. Llama 3 70B, Qwen 2.5 72B, DeepSeek Coder).
- [ ] **Start local server** — in LM Studio, click "Start Server" on port 1234.
- [ ] **Tunnel to the internet** — because the deployed dashboard lives on Netlify, it can't reach `localhost:1234`. Options:
  - **ngrok** (`ngrok http 1234`) — gives you `https://abcdef.ngrok-free.app`
  - **Cloudflare Tunnel** (`cloudflared tunnel --url http://localhost:1234`) — more permanent
- [ ] In InvestIQ → Settings → Admin → AI Provider:
  - Set **Provider** to `OpenAI-compatible`
  - Set **Provider URL** to your ngrok URL + `/v1` (e.g. `https://abcdef.ngrok-free.app/v1`)
  - Leave **Provider key** blank (LM Studio doesn't require auth by default)
  - Save, run AI Agents → they now hit your local model instead of Claude.
- [ ] Alternative for pure local testing: run the dashboard via `python -m http.server` in the `standalone` folder, then URL = `http://localhost:1234/v1`.

## 🟡 Retention / polish

- [ ] **Benchmark comparison** — overlay NZX 50 / S&P 500 lines on the performance chart. Needs historical index data.
- [ ] **Mobile responsive tweaks** — sidebar collapses on mobile (already in CSS), but test holdings table and ensure pulse strip wraps well.
- [ ] **Alerts** — "NVDA dropped 5% today", "dividend payment incoming". Email or browser notification. Needs a scheduled job.
- [ ] **Transaction history view** — from Akahu transactions or manual entry, separate from current holdings.
- [ ] **Holdings detail page** — per-ticker view with price chart, lot breakdown, Claude-generated news summary.

## 🟠 Architecture / ops

- [ ] **Migrate proxy to Supabase Edge Functions** — kill Render dependency. Three TypeScript functions (claude, market, akahu) on the platform user already uses. Eliminates cold starts, simplifies stack.
- [ ] **Akahu Business tier vs CSV fallback** — Akahu personal free tier returned 403 on `/holdings` endpoint (confirmed paywalled). Decision needed: pay for Akahu Business, or commit fully to CSV-based workflow.
- [ ] **Rate limiting on proxy** — PROXY_SECRET helps, but add per-IP throttling before opening to external users.
- [ ] **Delete the unused `webapp/` folder** — Next.js app never worked (CSRF on POST from file://). Already `.gitignore`'d but lives in repo history.

## 🟢 Commercialisation (Tier 3 from original plan)

- [ ] **Plan tiers** — free (1 portfolio, 20 holdings), paid (unlimited, AI included).
- [ ] **Stripe integration** — monthly subscription.
- [ ] **Password recovery email flow** — Supabase Auth supports it natively; just wire templates.
- [ ] **Email summary** — weekly digest: YTD return, biggest movers, upcoming dividends.

## 🐛 Known bugs / nits

- [ ] Yahoo Finance CORS fallback paths (corsproxy.io, allorigins.win) fail when proxy cold-starts — cosmetic console noise.
- [ ] If a user signs up with a typo in Supabase URL, the error is silent. Add validation on settings save.
- [ ] The pulse strip doesn't show intra-day FX-only changes well when prices are missing.

## ✅ Recently completed (for context)

**Infra**
- [x] Supabase auth + login gate + admin panel (with role bootstrap)
- [x] Per-user cloud sync with RLS (fixed recursion via `is_admin()` SECURITY DEFINER)
- [x] Platform-managed creds (PLATFORM_CONFIG) — regular users don't configure anything
- [x] Render proxy with PROXY_SECRET auth + ANTHROPIC_API_KEY env fallback
- [x] git → GitHub → Netlify/Render auto-deploy pipeline working end-to-end
- [x] Supabase RLS policies for profiles, investiq_portfolios, investiq_snapshots

**Features**
- [x] Multi-agent AI (Haiku + Sonnet ×2 parallel → Opus synthesiser)
- [x] Daily portfolio snapshots + performance chart with time-range toggles
- [x] CSV import with smart merge (case-insensitive, symbol-fallback, one clean mode)
- [x] Snapshot-on-import with custom date (backfill historical states)
- [x] CSV template with weighted-average-cost examples
- [x] Replace-all checkbox for clean slate imports
- [x] eToro column aliasing ("open rate", "invested÷qty" fallback)
- [x] Weighted average cost basis via lots[] with proper migration
- [x] "Invested" column in holdings table (cost basis)
- [x] Portfolio pulse strip (killed the racing market ticker)
- [x] Akahu proxy endpoint with holdings fetch (403 on free tier — paywalled)
- [x] **Watchlist** — track tickers without owning
- [x] **NZ FIF tax check** — de-minimis threshold calculator with FDR estimate
- [x] **Onboarding wizard** for new signups
- [x] **LM Studio / OpenAI-compatible provider** prep — ready to swap tomorrow

**Reliability**
- [x] Self-healing duplicate check on init (kills doubled-value bug)
- [x] Defensive dedup in saveToSupabase (never writes duplicate keys to cloud)
- [x] Diagnostic logging in loadFromSupabase (flags bad cloud data)
- [x] Admin diagnostic tools: Test Supabase R/W, Test Proxy, Scan & Fix
  Duplicates, Force Reload, Reset Cloud Portfolio
- [x] Cache staleness guard (local-newer-than-cloud → push local up)
- [x] Admin badge visible in header
- [x] Clear All Data verifies cloud deletion + reports RLS blocks
- [x] Holdings table alignment fix (display:grid on .table-header)
- [x] Holdings table progress bar layout (inline flex)

**UX**
- [x] Empty state redesigned with 3 action cards
- [x] Replaced mode dropdown confusion (add/sync/replace) with single smart-merge flow
- [x] CSV import date picker for snapshot
- [x] Admin platform config section (hidden from regular users)
