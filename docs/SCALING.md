# Scaling — Capacity, Bottlenecks, Future-Proofing

_What handles growth easily. What needs fixing before you have real users. What's a worry only if you hit Stripe-revenue territory._

Last updated: 2026-05-16 · v0.7a-family-foundation

---

## TL;DR — where you stand right now

You're built for **~500 active users / 5,000 holdings each / 50 AI-runs per user per day** before any infrastructure change is needed. Below that, ship features. Above that, see "What breaks at scale" below.

| Layer | Current limit | Headroom |
|---|---|---|
| Frontend (Netlify Pro) | Unlimited bandwidth + 25k build min/mo | Decades worth |
| Supabase Pro DB | 8 GB storage, 100 GB egress/mo, 500 connections | 10,000+ users with daily activity |
| Render Starter proxy | 1 instance, no autoscale, 512 MB | Bottleneck at ~1k concurrent users |
| Resend (free) | 100 emails/day | ~700 weekly digest users max |
| Anthropic API | 10k input tokens/min sonnet, 50k haiku | ~50 simultaneous Run-All-Agents |
| Yahoo Finance | Effectively unlimited (cached 5min) | Not a bottleneck |

---

## What scales easily (no work needed)

These layers are designed for horizontal growth. You can multiply users by 100× without touching them.

### Frontend (Netlify Pro)
- Static HTML/JS/CSS served from edge CDN
- Zero server logic — no backend on Netlify
- Adding users adds zero compute cost
- **Headroom: effectively infinite** for personal-finance traffic levels

### Supabase Postgres (Pro tier)
- 8 GB storage covers ~500k holdings across users (rough estimate at ~16KB per row average for portfolio JSONB)
- Auth scales to 50k MAU on Pro
- RLS is per-query cost not per-user cost — adding family RLS policies doesn't slow things at 1k users
- Connection pooler handles burst traffic
- **Headroom: 10,000+ active users before you'd need to think**

### Daily snapshots
- One row per user per day
- 1000 users × 365 days × 1 row = 365k rows/year — trivial
- Total `breakdown` JSONB size dominates storage. At 100 holdings × 200 bytes = 20KB per snapshot, 1000 users × 365 days = ~7 GB/year
- **At 8 GB Pro storage cap, you'd cap out around 1,000 daily-active users with full snapshot history. Mitigation: auto-prune snapshots older than 5 years**

### Frontend code (JS modules)
- 8 modules totalling ~1,800 lines + 7,500-line index.html
- Tree-shaking N/A (no bundler), but each module is ~50-400 lines — fine
- Load order matters (handled via `<script src>` sequence)
- **Adding 10 more modules: no problem**

### Family platform
- One profile row per user. One family row per household. ~5 family_members rows per family.
- Even at 10,000 users in 2,500 families: 12,500 rows total — Postgres laughs
- Cross-family visibility uses `can_view_user()` helper which is O(memberships) per query — caches well
- **No bottleneck until ~50,000 family memberships**

---

## What needs attention before growth

These would bite within the first 50-500 users. Fix them when you cross 20 active non-you users, NOT before.

### 1. Render proxy is a single point of failure 🟡 medium priority

**Current:** 1× Render Starter instance, no autoscale. If it crashes, everyone loses live prices simultaneously.

**Symptoms at scale:**
- ~1,000 concurrent users firing `/api/market` simultaneously → 512 MB RAM exhausted
- Cold-start latency (~10-30 sec) if instance restarts
- Single region (US-Oregon by default) → 200ms+ latency from NZ

**Mitigations (in priority order):**

a. **Move proxy to Supabase Edge Functions** (best). Already paid for, autoscaling, runs near data. ~half day to migrate `/api/market`, `/api/history`, `/api/news`, `/api/headlines`, `/api/search`, `/api/diag`. The `/v1/messages` Anthropic proxy is the tricky one — Anthropic needs streaming, Deno-style HTTP works fine.

b. **Add a second Render region** ($14/mo total) for failover. Easier but doesn't solve cold-start.

c. **Keep Render but upgrade to Standard ($25/mo)** for 2 GB RAM + zero-downtime deploys. Buys time.

**Recommendation:** option (a). Kill Render entirely once you cross ~50 daily-active users. Save $7/mo + simplification.

### 2. AI agents per-org rate limit 🟡 medium

**Current:** 10k input tokens/min for sonnet-4-5 on your org. Already burned this once with 107 holdings.

**Symptoms at scale:**
- 5+ users running "Run All Agents" simultaneously → first one succeeds, rest get 429
- Auto-retry helps but ~60s perceived delay per user

**Mitigations:**

a. **Already shipped:** demoted market+opportunity to Haiku (50k/min limit). Plus payload slim-down + 4s stagger.

b. **Request limit bump from Anthropic.** Email sales when you have ~100 paying users. Free for legit use cases.

c. **Server-side queue.** Instead of frontend hammering directly, have proxy queue agent runs and process sequentially. Adds complexity, only worth it past 50 simultaneous users.

**Recommendation:** keep current setup. Watch the `agent_run_failed` activity log entries. Bump limit if it crosses 1% failure rate.

### 3. Resend free tier — 100 emails/day 🟢 low priority right now

**Current:** Weekly digest = 1 email/user/week = 14 users/day average. At ~700 users you cap.

**Mitigation:** upgrade Resend to Pro ($20/mo for 50k emails/month) when you cross 500 weekly digest users. Trivial dial flip.

### 4. localStorage `investiq_v2` payload size 🟡 medium

**Current:** Browser localStorage caps at ~5-10 MB per origin (browser-dependent). Each holding row is ~500 bytes JSON. At 1,000 holdings = 500 KB. At 10,000 holdings = 5 MB → starting to hit caps.

**Symptoms:** save fails silently, "QuotaExceededError" in console.

**Mitigations:**

a. Don't store the full snapshot history in localStorage — already done (snapshots live in Supabase only)
b. Compress portfolio JSON before storing (~50% saving) — not needed unless you hit it
c. Use IndexedDB instead — bigger quota, async. Significant rework.

**Recommendation:** ignore until someone complains. Realistically 5,000-holding portfolios are exotic; warn user if approaching the limit.

### 5. Yahoo Finance — terms-of-service grey zone 🟡 medium

**Current:** yfinance scrapes Yahoo Finance pages. Officially unsupported. They could break the API any day.

**Mitigations:**

a. **Multiple data sources.** Today we already have a CORS fallback chain (corsproxy.io, allorigins.win). Could add Alpha Vantage (free tier 500 req/day), Tiingo, Polygon, Marketstack as alternatives.

b. **Caching aggressively.** 5-min market cache. Could go to 15-min during low-volatility.

c. **Switch to a paid source** — IEX Cloud is $9/mo for ~9M API calls. Cheap insurance.

**Recommendation:** wire in Alpha Vantage as fallback when Yahoo flakes. Defer paid sources.

### 6. Anthropic API key exposure surface 🟢 low

**Current:** `ANTHROPIC_API_KEY` lives as a Render env var. Each request to `/v1/messages` proxies through. If Render gets compromised or someone reads the env, they can drain your budget.

**Mitigations:**

a. Set hard spend cap in Anthropic Console ($X/month, alerts at 80%)
b. Move key to Supabase Vault when migrating to Edge Functions (encrypted at rest)
c. Rotate quarterly

**Recommendation:** set the spend cap today. Anthropic Console → Settings → Budget. Other items defer.

---

## What's a problem only at real scale (>1k active users)

Don't think about these until you're shipping to thousands. Documented so future-you (or future-LLM) knows the path.

### A. Supabase connection pooling

At 5k concurrent connections you'd hit Supabase's pooler limits. Mitigation: Supabase Connection Pooling settings + read replicas (Enterprise tier).

### B. Daily snapshot job for thousands of users

`recordDailySnapshot()` currently runs client-side on app open. At scale, half your users never open the app on a given day = missing snapshots. Mitigation: Edge Function scheduled daily that snapshots ALL users via service-role.

### C. Activity log table size

`investiq_activity_log` grows linearly with active usage. 1k users × 50 actions/week = 50k rows/week = 2.6M/year. Performance fine but storage costs add up. Mitigation: scheduled prune of entries older than 1 year.

### D. Multi-region deploy

Currently US-only. NZ users get ~200ms latency. At 1k active NZ users this becomes noticeable. Mitigation: Supabase Pro supports read replicas in `ap-southeast-2` (Sydney) for ~$100/mo extra. Worth it past 500 NZ-active users.

### E. Email deliverability

Resend's `onboarding@resend.dev` sender will be marked spam at scale. Need a custom domain + SPF/DKIM/DMARC records. **30 min one-time setup**, free, do it before sending to non-friends.

### F. Stripe + tax / GST

NZ GST registration kicks in at $60k NZD revenue/year. Stripe Atlas / NZ Limited company structure. Lawyer + accountant when you're ~1 year from this threshold.

---

## Future-proofing — design choices that scale forward

Already baked in. No work needed.

| Choice | Why it scales |
|---|---|
| RLS on every table | Multi-tenancy is solved at DB level. Adding users = zero code change |
| `LOCAL_ONLY_SETTINGS` array | Credentials never leak to cloud regardless of feature growth |
| SECURITY DEFINER helpers | Cross-table policies stay clean as features layer on |
| Idempotent migrations | Anyone can re-run setup safely. No "do not run this twice" gotchas |
| Tagged releases | Rollback is `git checkout <tag>` — always |
| Defensive timeouts on every await | One slow call doesn't lock the whole app |
| 429 auto-retry on Claude calls | Transparent to user, no manual retries needed |
| Snapshot table separate from portfolio table | Allows time-travel, historical analysis, FIF audit trail without bloat |
| Per-user proxy_secret + admin global | Auth scales without trusting a shared key |
| `plan_tier` column already in profiles | Paywall flip is a 1-line check per feature, no migration needed |
| Multi-family schema (one user, many families) | Edge cases (in-laws, accountant access) handled day one |
| Auto-snapshot Edge Function pattern (weekly-digest) | Template for any scheduled job — alerts, reports, monthly statements |

---

## Future-proofing — design debts to address

Known weak points. Worth fixing before they bite.

| Debt | Impact | Cost to fix | When to do it |
|---|---|---|---|
| `index.html` still 7,500 lines | Hard to navigate, merge conflicts | Continue JS split (auth, render, admin still inline) — 1 day | Before adding a co-dev |
| No automated tests | Regressions caught only by user reports | Set up Playwright for the 5 critical flows (signup, signin, add holding, run agents, family invite) — 1 day | Before 20 active users |
| No error monitoring (Sentry) | Bugs you don't see, you don't fix | Sentry free tier + drop-in JS — 30 min | Before 50 active users |
| No DB backups beyond Supabase auto | If Supabase has a disaster, you lose everything | Daily `pg_dump` to Supabase Storage via Edge Function — 1 hour | This week (cheap insurance) |
| No staging environment | Deploy → prod is one step | Netlify deploy previews per PR (free on Pro) + Supabase branch DB — 1 day | Before 20 users |
| Custom-domain email sender | Resend sandbox `onboarding@resend.dev` flagged as marketing/spam | DNS records + Resend verify — 30 min | Before sending to non-friends |
| Service-role key isn't rotated | If leaked, full DB access | Rotate quarterly; calendar reminder | Now (set reminder) |
| `webapp/` Next.js abandoned folder | Confusing in git history | `git filter-repo` to remove from history | Pre-v1.0 cleanup |
| Manual CRON_SECRET in SQL | Re-running setup.sql is fiddly | Move to Supabase Vault + `vault.decrypted_secrets` reference in cron body — 1 hour | When you add more cron jobs |
| Single user table for admins + family roles | If you grow to "InvestIQ for advisors" (multi-tenant SaaS), the admin role doesn't fit | Add a separate `tenants` table when commercialising | Pre-revenue |

---

## What I'd actually fix in the next 30 days

If you said "I want to be growth-ready in a month," ranked by ROI:

1. **Set Anthropic spend cap.** 5 minutes. Prevents a runaway-loop billing event.
2. **Custom Resend sender domain.** 30 min. Lets you actually send transactional emails to strangers without spam flagging.
3. **Sentry frontend integration.** 30 min. You start seeing real errors users encounter.
4. **Daily DB backup Edge Function.** 1 hour. Survives a Supabase disaster.
5. **Replace remaining `prompt()` / `confirm()` with proper modals.** 2 hours. Already on the polish list, just unlocked the "feels professional" perception.
6. **Migrate proxy to Supabase Edge Functions.** Half day. Kills Render entirely, eliminates a whole class of cold-start + single-region issues.
7. **Auto-prune snapshots older than 5 years.** 30 min. Storage hygiene before it matters.

Total: ~1 day of focused work, removes most of the medium-term scaling risk.

---

## Cost projection

At today's infra: **~$32 USD/month flat**, scales nearly free up to ~200 users.

| Service | Plan | Monthly | Marginal cost per user |
|---|---|---|---|
| Netlify | Pro | ~$19 USD | $0 (within bandwidth cap) |
| Supabase | Pro | $25 USD | <$0.01 (within storage cap) |
| Render | Starter | $7 USD | $0 until you exceed 512 MB |
| Resend | Free tier | $0 | $0 until 3k emails/mo |
| Anthropic | Pay-per-use | varies | ~$0.05 per "Run All Agents" |
| Yahoo Finance | Free (scrape) | $0 | $0 |
| Akahu | Not active | $0 | (would be $150-300/mo flat if enabled) |

**Break-even at $8/mo Pro tier:** ~4 paying users covers all infra. At 50 paying users you'd net ~$370/mo gross, ~$340/mo after infra. Reasonable indie-developer money.

---

## When this doc gets updated

- New paid service added (Stripe, Sentry, etc.)
- A bottleneck is hit in production
- Infrastructure tier changes (free → paid, Pro → Enterprise)
- New scale-relevant feature shipped (e.g. multi-region)
- Always: incrementally, in the same commit that triggered the change.
