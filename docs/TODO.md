# InvestIQ — TODO / Checkpoint

_A running list of everything we've parked. Pick items from here when you're ready to keep building._

---

## 🔴 High-value, NZ-specific

- [ ] **FIF tax tracker** — NZ investors with overseas cost basis > NZD $50k owe FIF income tax annually. Compute FIF basis automatically from holdings tagged as non-NZ. Flag when over threshold. Show fair dividend rate (5%) vs comparative value method. Export to IR form.
- [ ] **Dividend tracking** — US stocks especially. Either from Akahu transactions or manual dividend logging. Show YTD dividend income, projected annual.
- [ ] **NZX-specific data** — NZ Superannuation Fund holdings (NZX 50 weights), NZ dividend imputation credits logic.

## 🟡 Retention / polish

- [ ] **Onboarding wizard** for new users — wizard after first signup with options: Upload CSV / Connect Akahu / Add manually / Try demo data. Gated by `settings.onboardingComplete`.
- [ ] **Watchlist** — stocks user is researching but doesn't own. Separate from portfolio.
- [ ] **Benchmark comparison** — "Your portfolio YTD vs NZX 50 / S&P 500 / 60-40 mix". Overlay on the performance chart.
- [ ] **Mobile responsive** — sidebar collapses to hamburger, holdings table becomes cards, ticker wraps.
- [ ] **Alerts** — "NVDA dropped 5% today", "dividend payment incoming". Email or browser notification.
- [ ] **Transaction history view** — from Akahu or manual entry, separate from current holdings.
- [ ] **Holdings detail page** — per-ticker view with price chart, lot breakdown, news.

## 🟠 Architecture / ops

- [ ] **Migrate proxy to Supabase Edge Functions** — kill Render dependency. Three TypeScript functions (claude, market, akahu) on the platform user already uses. Eliminates cold starts, simplifies stack.
- [ ] **Akahu Business tier vs CSV fallback** — Akahu personal free tier returned 403 on `/holdings` endpoint (confirmed paywalled). Decision needed: pay for Akahu Business, or commit fully to CSV-based workflow.
- [ ] **Resolve the Akahu 403 definitively** — get full response body, confirm it's tier-related, then either hide the UI or pay.
- [ ] **Rate limiting on proxy** — must add before opening to external users.
- [ ] **Delete the unused `webapp/` folder** — Next.js app never worked (CSRF on POST from file://). Already `.gitignore`'d but lives in repo history.

## 🟢 Commercialisation (Tier 3 from original plan)

- [ ] **Plan tiers** — free (1 portfolio, 20 holdings), paid (unlimited, AI included).
- [ ] **Platform-owned Claude key** for paid tier — user doesn't need their own key.
- [ ] **Stripe integration** — monthly subscription.
- [ ] **Password recovery email flow** — Supabase Auth supports it natively; just wire templates.
- [ ] **Demo mode pre-signup** — sample portfolio visible without account, conversion hook.
- [ ] **Email summary** — weekly digest: YTD return, biggest movers, upcoming dividends.

## 🐛 Known bugs / nits

- [ ] Yahoo Finance CORS fallback paths (corsproxy.io, allorigins.win) fail when proxy cold-starts — cosmetic console noise. Fix by removing fallbacks once proxy is stable/migrated.
- [ ] If a user signs up with a typo in Supabase URL, the error is silent. Add validation on settings save.

## ✅ Recently completed (for context)

- [x] Supabase auth + login gate + admin panel
- [x] Per-user cloud sync with RLS
- [x] Fixed recursive admin policy via `is_admin()` SECURITY DEFINER function
- [x] Multi-agent AI (Haiku + Sonnet ×2 parallel → Opus synthesiser)
- [x] Daily portfolio snapshots + performance chart
- [x] CSV import — eToro column aliasing, invested÷qty fallback, weighted avg cost via lots[]
- [x] CSV import — case-insensitive platform match in sync/replace modes
- [x] Holdings table — added "Invested" column (cost basis)
- [x] Replaced scrolling market ticker with portfolio-focused pulse strip
- [x] Akahu proxy endpoint wired up (returns 403 on free tier — paywalled)
- [x] git → GitHub → Netlify/Render auto-deploy pipeline working end-to-end
