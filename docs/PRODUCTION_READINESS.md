# Production Readiness — Harbour IQ security assessment & go-live plan

_Assessed 2026-07-04 (v0.62/v0.63). Companion to `SECURITY.md` (risk register).
Scope: taking the Harbour IQ trial from "CEO-approved pilot on personal infra"
to something Harbour can run with staff data day-to-day._

---

## 1. Current posture — what's already in place ✅

| Area | Status |
|---|---|
| **Tenant isolation** | Separate Supabase project per edition (personal / harbour). RLS on every user table scopes rows to `auth.uid()`. |
| **Cross-account isolation on shared devices** | v0.62: local cache is owner-tagged; foreign data is wiped before any sync; sign-out clears the full envelope + backups. |
| **Access control** | Invite-only approval gate (`is_approved`, migration 018) with a DB trigger blocking self-elevation of `is_admin`/`is_approved`. Admin notified on signup (v0.62a). |
| **Proxy auth** | Per-user secrets validated via SECURITY DEFINER RPC against BOTH projects (v0.56c/d); global admin secret as break-glass. CORS locked to the two Netlify domains. Per-IP rate limit 60/min. |
| **Secrets** | Server-side only (Render env, Supabase Function secrets). Browser holds only publishable keys (safe by design). `LOCAL_ONLY_SETTINGS` never sync to cloud. No secrets in git (placeholder pattern). |
| **Storage** | `fund-reports` bucket (migration 020): private, approved-users read via signed URLs, admin-only write, PDF-only, 25MB cap. `backups` bucket for daily dumps. |
| **Transport headers** | Netlify `_headers` (v0.63): HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, COOP. |
| **Monitoring** | Sentry (browser errors), activity log table (signups, imports, admin actions), Admin diagnostics (Test Proxy / Digest / Signup Email / Alert Check). |
| **Session hygiene** | Idle auto-logout; sign-out flushes pending writes then wipes local data. |
| **FMA wording** | Agents + reports carry "not investment advice"; the generated fund report explicitly states it is not an offer document or FMC fund update. |
| **Data classification** | Fund holdings = public Disclose data; unit prices/returns = internal but low-sensitivity; no client PII in the app. |

## 2. Gaps — prioritized checklist

### P0 — before letting more Harbour staff in
1. **Run the outstanding migrations in the Harbour project** and verify via the Admin test buttons: 017 (CMS), 018 (approval), 019 (proxy RPCs), 020 (report storage). _Owner: you (SQL editor)._
2. **Supabase Auth hardening (both projects, dashboard):** enable leaked-password protection, min password length ≥ 10, and **MFA on your admin account**. Session lifetime review.
3. **Confirm Resend delivery** end-to-end (Admin → Test Signup Email on both editions). If the from-address is still `onboarding@resend.dev`, verify a sending domain so approval emails reach users.
4. **Clean any already-bled account data** (pre-v0.62 cross-account pushes): for each affected account, Admin → Reset Cloud Portfolio, then re-import.
5. **Privacy notice** shown at signup (Privacy Act 2020): what's stored, where (Supabase AU/US region?), who the subprocessors are (Supabase, Netlify, Render, Anthropic, Resend, Sentry), and a contact for deletion requests.
6. **Account deletion path**: at minimum a documented admin runbook (delete auth user → cascade profiles/portfolios/snapshots/log rows); ideally a self-serve button.

### P1 — production hardening (first month)
7. **Kill the Tailwind CDN** (console literally warns "should not be used in production"): build Tailwind CSS at deploy time or vendor the generated stylesheet. Removes a runtime script dependency + the biggest CSP blocker.
8. **Pin + SRI every remaining CDN asset** (chart.js\@4.4.0, supabase-js\@2 → pin exact version, font-awesome, Sentry bundle). `@2` floating tags are a supply-chain risk.
9. **Content-Security-Policy** in `_headers` once Tailwind is built: `script-src 'self' cdn.jsdelivr.net browser.sentry-cdn.com` etc. Start with `Content-Security-Policy-Report-Only`.
10. **Per-user rate limiting on the proxy** (currently per-IP): key limits on the authenticated user id; tighter cap for `/v1/messages` (token cost).
11. **Retire the global `PROXY_SECRET` from clients**: keep it only as a server-side break-glass; you move to your per-user secret like everyone else. Rotate it once all users are per-user.
12. **XSS sweep of imported data**: Disclose asset names / CSV fields flow into `innerHTML` templates — most call `_escape()`, but audit every template that interpolates holding names/notes (grep `h.name` / `h.notes` in template literals) and add escaping where missed. CSV-injection: prefix `=,+,-,@` cells on export.
13. **Backup restore drill**: daily-backup function writes JSON dumps — actually restore one into a scratch project and document the steps. Untested backups don't count.
14. **Uptime monitoring** on the proxy + both sites (UptimeRobot/Betterstack free tier) with email alerts; Render can cold-sleep on failure.

### P2 — organizational / governance (before "production" is declared)
15. **Move infra into Harbour-owned accounts** (or a Harbour-billed team): today the Harbour edition runs on your personal Netlify/Render/Supabase/Anthropic/Resend accounts. Single-person risk (bus factor, offboarding, billing) + data-governance optics. Transfer or recreate: Supabase project transfer, Netlify site transfer, Render service, custom domain (`iq.harbourasset.co.nz`?) via Harbour IT.
16. **SharePoint ingestion (Phase B)** replaces manual OneDrive drops: Harbour IT registers an Azure AD app (Graph `Sites.Read.All` scoped to the reporting library) → scheduled Edge Function pulls the unit-price CSVs + report PDFs nightly → imports server-side. Everything client-side already exists (parsers, storage bucket); only the fetch leg is missing.
17. **Access review cadence**: monthly check of approved users + admin list; revoke leavers (Revoke button already kills proxy access + can be paired with auth user disable).
18. **Anthropic data controls**: confirm the org's API data-retention settings; document that holdings names/weights are sent to the Claude API via the proxy (public Disclose data — low risk, but state it).
19. **Terms of use / internal-tool disclaimer** page for the trial group; FMA review by compliance if it ever goes beyond internal staff.
20. **Dependency & secret rotation schedule**: quarterly — rotate PROXY_SECRET + Resend key, review Supabase publishable keys, bump pinned CDN versions.

## 3. Suggested sequence
- **This week:** P0 items 1–4 (all ≤30 min each, mostly dashboard clicks).
- **Before adding the next 5 users:** P0 5–6 + P1 7–9 (privacy notice, Tailwind build, SRI/CSP).
- **Within a month:** rest of P1; start P2 15/16 conversations with Harbour IT (infra transfer + Azure app are their queue, longest lead time — start now).

## 4. What I'd explicitly call safe today
For the current trial (a handful of approved Harbour staff, public-register fund data, no client PII): the stack is reasonably hardened — isolation, auth, approval, transport, and monitoring are all in place. The P0 list is about closing operational loose ends, not fundamental design flaws. The two structural items are **infra ownership** and **SharePoint automation** — both Harbour-IT conversations worth starting immediately because everything else can proceed in parallel.
