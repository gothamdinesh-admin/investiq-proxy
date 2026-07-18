# Harbour IQ — Go-Live Checklist

_Single source of truth for the manual, infrastructure, and compliance steps
that turn the Harbour IQ prototype into something that can hold real data.
Code ships automatically (git push → Netlify + Render); everything in this file
is a **human step** done outside the repo. Update the status boxes as you go._

**Legend:** `[ ]` not started · `[~]` in progress · `[x]` done · 🔴 blocks real client data · 🟡 blocks trial polish · ⚪ nice-to-have

Last updated: 2026-07-18

---

## 1. Supabase — Harbour project (`sxbzvvzsvvkaukqrqgjt`)

Migrations are **manual paste** into the SQL Editor. Run in order; each is
idempotent (safe to re-run).

- [ ] 🟡 Run migrations `007`–`020` in the Harbour project (fresh project needs the full set). Harbour-critical ones:
  - [ ] `016_multi_portfolio.sql` — fund books
  - [ ] `017_cms_content.sql` — edition content overrides
  - [ ] `018_user_approval.sql` — signup approval gate
  - [ ] `019_proxy_secret_rpcs.sql` — per-user proxy secret (AI features)
  - [ ] `020_fund_reports_storage.sql` — `fund-reports` Storage bucket + RLS
- [ ] 🔴 **Auth → JWT expiry = 3600s.** If set too low, users get signed out every ~2 min. (This was the cause of the earlier "signing out" bug.)
- [ ] 🔴 **MFA enforced for staff/admin** accounts.
- [ ] ⚪ Confirm RLS on every table (users see only their own rows; staff/admin as intended).

## 2. Supabase — Edge Functions (Harbour project)

Deployed by pasting source into the Dashboard editor. Set secrets under
Edge Functions → Manage secrets.

- [ ] 🟡 Deploy `notify-signup` (new-signup email to ops).
- [ ] 🟡 Deploy `submit-fund-form` (Additional Investment / Redemption instruction email + signatures). Keep **Verify JWT = ON**.
- [ ] 🟡 Secrets: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `FUND_OPS_EMAILS`, `CRON_SECRET`, `PROXY_URL`, `PROXY_SECRET`.
- [ ] 🟡 **Resend sending domain verified** (until then, test mode only delivers to `gothamdinesh@gmail.com`; `FUND_OPS_EMAILS` defaults there for the trial).
- [ ] ⚪ Other functions (`weekly-digest`, `check-price-alerts`, `daily-backup`, `refresh-nz-funds`) — deploy only if the trial uses them.

## 3. Storage — official fund reports

- [ ] 🟡 `fund-reports` bucket exists (created by migration `020`).
- [ ] 🟡 Upload the monthly PDFs, **named by fund code** (e.g. `Reporting_HARAEQ_Apr26.pdf`). Holders auto-match by code; the Reports page picker filters by fund.

## 4. Proxy — Render (`claude_proxy.py`)

Env vars on the Render service. Auto-deploys from git push.

- [ ] 🔴 `ALLOWED_ORIGIN` includes the Harbour origin, **no trailing slash** (`https://harbour-iq.netlify.app`). Trailing slash caused the earlier CORS 403.
- [ ] 🔴 `SUPABASE_PROJECTS` includes the Harbour project URL + anon key (multi-project secret validation for AI calls).
- [ ] 🟡 `PROXY_SECRET`, `ANTHROPIC_API_KEY` set.

## 5. Frontend — Netlify

- [ ] 🟡 Harbour site builds from `standalone/` (publish dir). Cache-buster is now auto-stamped by the pre-commit hook — see §7.
- [ ] ⚪ Custom domain (target `iq.harbourasset.co.nz`) with SPF/DKIM for transactional email — part of infra ownership (§8).

## 6. Onboarding app (separate repo, `New project/`)

- [ ] 🟡 Run `F3_resolve_invite.sql` once in the onboarding project's Supabase (fixes cross-device invites + closes the invite-enumeration leak).

## 7. Dev workflow (repo)

- [x] **Cache-buster automated.** `scripts/stamp-cache-bust.js` hashes `standalone/js/*.js` → stamps `?b=<hash>` on module tags. Wired via `.githooks/pre-commit`.
  - [ ] **One-time per clone:** `git config core.hooksPath .githooks`
- [x] **Static smoke test.** `scripts/smoke-test.js` checks: all inline + module scripts parse, the cache-buster is stamped + consistent, and every `showSection()` target has a `#section-…`. Runs in the pre-commit hook (blocks a broken commit). Run manually: `node scripts/smoke-test.js`.

## 8. Infrastructure ownership (long lead — start now) 🔴

The prototype runs on the developer's **personal** cloud accounts. Before real
client data, move to **Harbour-owned** infra. See `CLIENT_PLATFORM_ROADMAP.md`
and `HARBOUR_ENABLEMENT_REQUEST.md`.

- [ ] 🔴 Harbour-owned Supabase org/project (DB + auth).
- [ ] 🔴 Harbour-owned hosting (static + API) or Harbour's stack.
- [ ] 🔴 Harbour-owned Anthropic (Claude) API account.
- [ ] 🔴 Harbour subdomain + DNS (SPF/DKIM).
- [ ] 🔴 **APEX account-holdings feed** (repeatable export/API keyed by the unique account id) — the piece that makes the client tier real.

## 9. Compliance / Risk (long lead — start now) 🔴

Handling NZ investors' PII + financial data. See `CLIENT_PLATFORM_ROADMAP.md` §4.

- [ ] 🔴 Privacy Act 2020 review — data map, retention schedule, breach-response plan. (In-app privacy notice + deletion runbook already drafted.)
- [ ] 🔴 FMC-licence / outsourcing / technology-systems assessment (Harbour compliance owns this — the real gate to go live).
- [ ] 🔴 Assurance target agreed: SOC 2 (Type I→II) / ISO 27001 / reliance on APEX's ISAE 3402·SOC 1.
- [ ] 🔴 Access-model sign-off: staff (all) vs client (own only) + audit logging of who views which client.

---

### Hard line
Do **not** load real client data (names, IRD numbers, balances) into the current
prototype stack. Dummy or single-self-owned data only until §8 + §9 are cleared
by Harbour. This is the standing constraint from `CLAUDE.md` and the roadmap.
