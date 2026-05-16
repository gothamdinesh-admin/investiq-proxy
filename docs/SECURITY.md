# Security & Safety Audit

_Comprehensive risk register across all dimensions: cyber, data integrity, cost runaway, compliance, operational, future-proofing. Read at the start of every significant feature; update when the surface changes._

Last audited: 2026-05-16 · v0.7c-price-alerts

---

## 🚨 Critical (do this week)

Issues that could cost real money, leak data, or break trust if exploited. Each has a concrete fix.

| # | Risk | Why critical | Fix | Effort |
|---|---|---|---|---|
| C1 | **No spend cap on Anthropic API** | A runaway loop, compromised proxy, or attacker who finds the proxy URL could drain your wallet within hours. No alert means you find out via credit card statement. | Anthropic Console → Settings → Limits → set monthly cap (e.g. $100 USD) + email alert at 80% | 5 min |
| C2 | **No spend cap on Render/Supabase/Netlify** | Same risk on infrastructure side — runaway compute could hit usage limits or auto-scale charges | Supabase: Project Settings → Billing → set notification threshold. Render + Netlify Pro plans have hard caps on Pro tier — verify. | 10 min |
| C3 | **`SUPABASE_SERVICE_ROLE_KEY` exposure** | Service role key bypasses ALL RLS. If leaked, an attacker can read/write every user's data. Currently only used by Edge Functions where it's required. | Verify it's NEVER in: (a) frontend code, (b) Render env, (c) git history. Only in Supabase Function secrets. Rotate quarterly. | 10 min check + calendar reminder |
| C4 | **No backup beyond Supabase's auto-snapshots** | If your Supabase project is accidentally deleted, you lose everything. Their auto-backups are point-in-time recovery within 7 days; longer disasters are recoverable only if you have your own snapshots. | Build a daily Edge Function that `pg_dump`s critical tables and writes to Supabase Storage. Keep 30 days of dumps. | 1 hour |
| C5 | **No error monitoring** | Bugs you don't see, you don't fix. Currently rely on user reports. | Add Sentry frontend SDK (free tier, 5k events/mo). 30-min install. Drop in `<script>` + `Sentry.init({...})`. | 30 min |

---

## 🟡 High priority (within 30 days)

Real risks but no immediate exploit path. Fix before scaling beyond 20 active users.

| # | Risk | Why it matters | Fix | Effort |
|---|---|---|---|---|
| H1 | **Resend sandbox sender (`onboarding@resend.dev`)** | Emails sent to non-friends get marked spam. Limits credibility once users come from elsewhere. | Resend → Add Domain → DNS records (SPF/DKIM/DMARC) → verify. Update `RESEND_FROM_EMAIL` to `digest@yourdomain.co.nz`. | 30 min + DNS propagation wait |
| H2 | **No Terms of Service or Privacy Policy** | NZ Privacy Act 2020 requires a notice telling users what data you collect, why, and how to delete it. GDPR similar for any EU users. **Legal exposure increases the moment a non-you user signs up.** | Use a template (Iubenda free tier, or copy a similar product's). Link from sign-up page + footer. Add data-deletion flow (Settings → Delete my account). | 1-2 hr |
| H3 | **Family invite emails go to anyone you type** | No verification step — if you typo a stranger's email, they get an invite. They can't accept (RLS would reject) but it could be confusing/spammy. | Already accept-flow gated, but consider adding "are you sure?" confirm with email shown. | 15 min |
| H4 | **No 2FA on Supabase admin login** | If your Supabase password leaks, attacker has full control. Includes ability to add admin users, drop tables, leak secrets. | Supabase Dashboard → Account Settings → Enable 2FA (authenticator app). | 5 min |
| H5 | **No idle/auto-logout on Render dashboard** | Same as above — if you stay logged in on a shared machine and someone gets access, they can change env vars including `PROXY_SECRET`. | Habit: log out of Render/Supabase after admin work. Or use a separate browser profile. | Habit |
| H6 | **Proxy `/api/diag` is publicly callable** | Anyone can hit it and learn: PROXY_SECRET is set, SUPABASE_URL is set, ALLOWED_ORIGIN whitelist. Doesn't leak the actual values, but reveals architecture. | Acceptable today (read-only, no secret leak). Consider gating to admin-only or removing in production. | Decide later |
| H7 | **localStorage cap on huge portfolios** | Browser limit ~5-10 MB. At 5000+ holdings the `investiq_v2` save fails silently with `QuotaExceededError`. User loses local cache. | Warn the user when state approaches cap. Optionally compress before storing. | 2 hours |
| H8 | **No staging environment** | Every deploy hits production directly. A bad commit breaks the live site immediately. | Netlify Pro supports deploy previews per PR (free). Enable in Netlify Site Settings → Build & Deploy → Deploy contexts. Same for Render via branch deploys. | 30 min |
| H9 | **`webapp/` zombie folder in git history** | Abandoned Next.js code that was never deployed. Lives in git history forever, indexable by anyone who clones the repo. Confuses future devs. Possible old secrets in commits. | `git filter-repo --path webapp/ --invert-paths` rewrites history to remove it. Destructive — must coordinate. | Half day |
| H10 | **No CAPTCHA on signup** | Bots could mass-create accounts. RLS limits damage but auth.users table fills with junk, plus Supabase auth has rate limits that could be hit. | Supabase has hCaptcha integration (free). Auth → Settings → enable hCaptcha. | 15 min |

---

## 🟢 Medium priority (3-6 months)

Worth fixing but not immediately exploitable. Mostly hardening and future-proofing.

| # | Risk | Why it matters | Fix |
|---|---|---|---|
| M1 | **No automated tests** | Regressions caught only by manual click-through. Big releases now risky. | Playwright covering 5 critical flows (signup, signin, add holding, run agents, family invite). |
| M2 | **Render proxy single point of failure** | If `claude_proxy.py` crashes, every user loses live data + AI agents simultaneously. | Migrate to Supabase Edge Functions; kill Render. Or upgrade to Render Standard with autoscale. |
| M3 | **Service role key in Edge Function env** | If a function is misconfigured (Verify-JWT off + no auth in code), service role could leak. | Audit each function for explicit auth gate at the top. |
| M4 | **XSS surface via user-entered fields** | If `h.notes` or `h.name` could ever bypass `_escape`, attacker could inject `<script>`. Currently audit-clean but no automated check. | Add CSP header in `netlify.toml` to block inline `<script>` not in our SHA list. |
| M5 | **No rate-limit on signup** | Spam signups → Supabase auth rate limits eventually kick in but not before. | Supabase Auth → Rate Limits → tighten signup/email-sending rates. |
| M6 | **Children's accounts** (Family role 'child') don't have separate consent flow | NZ Privacy Act 2020 has children's-data provisions; technically the child consents themselves when they sign up. Adults managing on behalf could collect their data without explicit minor-protection. | Add a flag during invite for "this person is under 16" → triggers a parental-consent confirmation flow. Tag profiles row with `is_minor`. |
| M7 | **No audit-log retention policy** | `investiq_activity_log` grows linearly forever. At 1k users × 50 actions/week = 2.6M/year. Will hit Supabase Pro 8 GB cap eventually. | Schedule a monthly Edge Function that deletes entries older than 1 year. |
| M8 | **No subresource integrity (SRI) on CDN scripts** | Tailwind CDN, Chart.js, Supabase JS are loaded via `<script src>`. If those CDNs are compromised, your users execute malicious code. | Add `integrity=...` hashes to each `<script>` tag. Re-generate on version bumps. |
| M9 | **Manual deploy of Supabase Edge Functions** | Copy-paste from local file → Dashboard. Easy to forget; easy to deploy the wrong version. | `supabase functions deploy --no-verify-jwt` once Scoop is installed. Or accept the manual step + checklist it. |
| M10 | **No DKIM email signing for outbound** | Even custom domain emails get spam-flagged without DKIM. | Set up DKIM in Resend dashboard. |

---

## 🔵 Acceptable risk (documented, not fixing now)

These exist by design or are negligible at current scale.

| # | Risk | Why we accept it |
|---|---|---|
| A1 | **Anon key in `00-config.js` is public** | Supabase anon key is designed to be public — RLS enforces actual security. The key's purpose is just identifying which project to talk to. |
| A2 | **Frontend visible in browser DevTools** | Static-site model means anyone can see HTML/JS. Acceptable because no auth-token-related secrets live there — secrets only ever in env vars / Supabase secrets. |
| A3 | **Agent prompts public in GitHub** | Until commercial, transparency > obscurity. See SCALING.md "should prompts be proprietary". Migrate to DB-stored when paywall launches. |
| A4 | **Drag-drop Netlify deploys leave no audit trail beyond Netlify** | Acceptable since you're the only deployer. Once a co-dev joins, switch to git-only deploys with required PR reviews. |
| A5 | **Yahoo Finance scraping** | Officially unsupported by Yahoo. Could break any day. Mitigation: CORS fallback chain + manual fund-price entry already exists. Long-term: switch to paid source (Alpha Vantage / IEX). |
| A6 | **No HSTS header on Netlify** | Netlify auto-redirects HTTP → HTTPS but doesn't send HSTS preload by default. Acceptable for early stage. Can enable via `netlify.toml` `[[headers]]` later. |
| A7 | **localStorage stores portfolio JSON unencrypted** | Anyone with physical access to the device can read the data. Same risk as any web app. Mitigation: idle timeout 30 min auto-logout already exists. Acceptable for personal-finance use case. |
| A8 | **Service role key shared between weekly-digest, family-invite, check-price-alerts** | Could be rotated; each function uses it for the same purpose (server-side data access). Rotate quarterly is sufficient. |

---

## 🛡️ What we have right (the good column)

Things that are already done well — keep them this way.

- **RLS on every table.** Multi-tenant isolation enforced at the database. Adding family RLS extended this correctly via `can_view_user()`.
- **`LOCAL_ONLY_SETTINGS` array** prevents credentials syncing to cloud. The pattern is small, focused, and works.
- **SECURITY DEFINER helpers** (is_admin, can_view_user, redeem_family_invite) have `SET search_path = public` to prevent search-path attacks.
- **Idempotent migrations** (each `.sql` file safely re-runnable) prevents "ran it twice" disasters.
- **Tagged releases** for every meaningful drop — `git checkout <tag>` always recovers.
- **Defensive timeouts on every await** in signIn — no more "Please wait" hang.
- **429 auto-retry** in Claude calls — handles transient rate limits silently.
- **Proxy auth uses two-tier model** — admin global secret + per-user secrets. Compromise of one doesn't compromise all.
- **Granular 403 reasons** on proxy — diagnoses failures without leaking secret values.
- **HTTPS everywhere** — Netlify auto-redirects, Supabase requires it, Render serves it.
- **Cron secret on `X-Cron-Secret` separate from `Authorization`** — works with or without Verify-JWT, avoids the common "anyone with Supabase anon key can fire" hole.
- **Snapshot-based history in a separate table** — prevents accidental overwrites from corrupting the timeline.
- **Idle 30-min auto-logout** — shared/lost device protection.
- **`profiles.is_approved` gate** before per-user proxy_secret is issued — admin control of who can access AI agents.

---

## 📋 The pre-significant-change checklist

Before ANY change touching auth, data, secrets, or external services, walk through:

```
[ ] Cyber       — Does this expose a new attack surface? New secret? New
                  endpoint that needs auth?
[ ] Data        — Could this irreversibly modify or delete data? Is the
                  change backup-recoverable?
[ ] Cost        — Could this loop, retry forever, scale unexpectedly?
[ ] Compliance  — NZ FMA wording? Privacy Act 2020? Children's data?
                  Financial-advice disclaimers visible?
[ ] Operational — Is there a rollback path? Tag before deploying?
[ ] Future-proof— Does this lock us into a vendor / API that could change
                  in 6 months? What's our exit plan?
[ ] Trust       — Per ROLES.md: does this need explicit OK before I do it?
```

When unsure on any line, **stop and ask**. The 30-second pause is always cheaper than the recovery.

---

## Quick remediation calendar (recommended)

| When | Do |
|---|---|
| **This week** | C1 (Anthropic spend cap), C2 (Supabase + Netlify billing alerts), H4 (2FA on Supabase login) |
| **This month** | C3 (audit service-role exposure), C4 (daily DB backup function), C5 (Sentry), H1 (custom Resend domain), H2 (Terms of Service + Privacy Policy) |
| **Next 3 months** | M1 (Playwright tests), M2 (migrate to Edge Functions), M3 (function auth audit), M4 (CSP header) |
| **Annually** | Rotate `SUPABASE_SERVICE_ROLE_KEY`, `PROXY_SECRET`, `CRON_SECRET`, `RESEND_API_KEY` |

---

## When this doc gets updated

- New service / API key added → list it under managed secrets
- A vulnerability discovered → add to the relevant risk tier
- A risk gets mitigated → move it to "What we have right"
- A new compliance regime kicks in (e.g. EU users → GDPR section)
- Always: incrementally, in the same commit that triggered the change.

---

## How to use this doc operationally

**Before opening signup to non-friends:** clear all 🚨 Critical + at least H1 (sender domain), H2 (Terms/Privacy), H4 (2FA).

**Before charging money:** clear all Critical + all High + at least M1 (tests), M3 (function auth audit), M9 (deploy automation), and have a written incident response plan.

**Before SaaS launch:** clear Medium too, hire a real security review.
