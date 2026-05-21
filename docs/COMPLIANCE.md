# InvestIQ Compliance, Cyber Security & Privacy Register

_v0.16 · 2026-05-19 · Owner: Gotham Dinesh · Reviewed quarterly_

This document is the single source of truth for every control InvestIQ has, every gap we've identified, and the path to close those gaps. It's written for two audiences:

1. **An internal CTO / Risk officer** who needs to evidence what's in place.
2. **An external auditor** (SOC 2 / ISO 27001 / NZ FMA) who needs proof.

Each entry follows the same shape: **Control · State · Evidence · Gap · Effort to close**.

---

## 1. Cyber security

### 1.1 Authentication & access

| Control | State | Evidence | Gap | Effort to close |
|---|---|---|---|---|
| **Password-based auth** | ✅ Implemented | Supabase Auth (bcrypt at 2^10) | — | — |
| **Passwordless / magic link** | ✅ Implemented | Supabase Auth | — | — |
| **OAuth** (Google / Microsoft) | ✅ Available | Supabase Auth provider config | Not yet enabled in production | 2 hours per provider |
| **2FA / MFA** | ⚠️ Supported, not enforced | Supabase Auth TOTP support | No enforcement policy | **1 day** to wire enforcement + recovery codes UI |
| **Session timeout** | ✅ Implemented | `IDLE_LIMIT_MS = 2hr` in `00-config.js`, focus-aware pause | — | — |
| **Sign-out wipes local cache** | ✅ Implemented | `clearLocalUserData()` in `40-auth.js` | — | — |
| **Brute-force protection** | ⚠️ Partial | Supabase rate-limit on sign-in; proxy rate-limit per IP | No CAPTCHA on signup | **1 hour** — wire hCaptcha |
| **Account lockout policy** | ❌ Not implemented | — | No lockout after N failed attempts | 1 day |
| **Admin role gating** | ✅ Implemented | `profiles.is_admin` + RLS + client-side `_isAdmin` checks | — | — |
| **Approval-gated signup** | ✅ Implemented | `profiles.is_approved` + pending-approval overlay | — | — |

### 1.2 Data security

| Control | State | Evidence | Gap | Effort to close |
|---|---|---|---|---|
| **Row-level security (RLS)** | ✅ Implemented | Every Supabase table has own-rows-only policies | — | — |
| **Encrypted in transit** | ✅ Implemented | HTTPS enforced by Netlify, Render, Supabase | — | — |
| **Encrypted at rest** | ✅ Implemented | Supabase Postgres AES-256 (managed) | — | — |
| **Daily automated backups** | ✅ Implemented | Supabase managed backups (7-day retention on Pro tier) | No tested restore drill | **2 hours** — run a restore to staging |
| **Backup encryption** | ✅ Implemented | Inherited from Supabase managed backups | — | — |
| **Cross-region replication** | ❌ Not implemented | Supabase Pro region: AWS ap-southeast-2 only | DR scenario coverage | $200/mo for Supabase Team tier with read replica |
| **API key rotation policy** | ⚠️ Manual | Render secrets managed by hand | No automated rotation, no calendar reminders | 1 hour to set quarterly calendar |
| **Secrets in code** | ✅ Zero | Audited via `git log` + `grep`; secrets in Render/Supabase only | — | — |
| **PII inventory** | ✅ Documented | See section 4 | — | — |

### 1.3 Application security

| Control | State | Evidence | Gap | Effort to close |
|---|---|---|---|---|
| **CORS policy** | ✅ Enforced | Proxy allows only `*.netlify.app` + `localhost` | — | — |
| **Proxy secret on every call** | ✅ Implemented | `X-Proxy-Secret` header validated; rate-limit fallback | — | — |
| **XSS protection** | ⚠️ Mostly | All user-input rendered via `_escape()` helper; some `innerHTML` for trusted markup | No automated XSS scanner | 2 hours to add eslint-plugin-no-unsafe-innerhtml |
| **CSP headers** | ❌ Not set | — | No Content-Security-Policy | **half-day** to author + deploy via Netlify `_headers` |
| **WAF** | ❌ Not in front | Netlify default DDoS only | Cloudflare Pro at $20/mo gives proper WAF | Half-day to wire |
| **Subresource integrity (SRI)** | ⚠️ Partial | Tailwind CDN not SRI-hashed | Catalogued in TODO; not blocking | 1 hour |
| **Input validation server-side** | ✅ Via Supabase | RLS + CHECK constraints | — | — |
| **SQL injection** | ✅ Protected | Supabase REST only — no raw SQL surface | — | — |
| **Prompt injection (AI)** | ⚠️ Mitigated | AI prompts never echo user content as instructions; output only displayed, never executed | No formal red-team | 1 day for adversarial test suite |
| **Dependency vulnerability scanning** | ❌ Not automated | — | Should run `npm audit` / Snyk on every push | 2 hours via GitHub Actions |
| **Penetration test** | ❌ Not performed | — | External firm pen-test needed for SOC 2 | **$15–30k NZD + 2-week engagement** |

### 1.4 Observability & monitoring

| Control | State | Evidence | Gap | Effort to close |
|---|---|---|---|---|
| **Error monitoring** | ✅ Implemented | Sentry (free tier) capturing JS exceptions + unhandled rejections | — | — |
| **Activity audit log** | ✅ Implemented | `investiq_activity_log` table — every state change | No retention policy | 1 hour to add 365-day TTL |
| **Outbound integration logs** | ✅ Implemented | Proxy stdout captured in Render logs | 30-day retention only on free tier | Render paid tier or external log sink |
| **Uptime monitoring** | ❌ Not in place | — | UptimeRobot free tier covers it | 30 min |
| **Public status page** | ❌ Not in place | — | Nice trust signal | 2 hours via Statuspage/Atlassian |
| **Alerts on auth failures** | ❌ Not configured | Sentry catches errors, not security signals | — | 1 day |

---

## 2. Privacy (NZ Privacy Act 2020 + GDPR)

### 2.1 Information privacy principles (IPPs)

| IPP | Control | State |
|---|---|---|
| **IPP 1 — Purpose of collection** | Stated in T&Cs draft + signup screen | ⚠️ T&Cs not yet finalised |
| **IPP 2 — Source of personal info** | Direct from user only; no scraping | ✅ |
| **IPP 3 — Collection from the individual** | Email + portfolio data + opt-in features | ✅ |
| **IPP 4 — Manner of collection** | User-driven only, no covert collection | ✅ |
| **IPP 5 — Storage & security** | Supabase ap-southeast-2 (NZ proxy), RLS, encrypted | ✅ |
| **IPP 6 — Access to personal info** | User can view their own data via UI | ⚠️ No formal "download my data" export |
| **IPP 7 — Correction of personal info** | All fields editable in-app | ✅ |
| **IPP 8 — Accuracy** | User maintains their own portfolio data | ✅ |
| **IPP 9 — Retention** | No defined retention period | ⚠️ Need policy: 7 years for tax-relevant data, otherwise on user request |
| **IPP 10 — Limits on use** | Used only for stated purpose (portfolio tracking + AI analysis) | ✅ |
| **IPP 11 — Disclosure** | No third-party disclosure except as-needed integrations (user-consented) | ✅ |
| **IPP 12 — Unique identifiers** | Supabase UUIDs only; no IRD/NZBN unless user provides for tax | ✅ |
| **IPP 13 — Cross-border disclosure** | AI calls leave NZ (Anthropic — US). Stated in T&Cs draft | ⚠️ Must disclose in privacy policy |

### 2.2 GDPR (for EU users)

| Right | Status |
|---|---|
| Right to access | ⚠️ Partial — UI shows data, no formal export endpoint |
| Right to rectification | ✅ All user data editable |
| Right to erasure ("be forgotten") | ⚠️ Admin can delete; no self-serve flow yet |
| Right to data portability | ✅ CSV + JSON export available |
| Right to object to processing | ⚠️ Marketing opt-out present; need explicit consent toggles |
| Data breach notification (72hr) | ❌ No formal incident response plan |

**Critical gaps:** Self-serve "Download my data" + "Delete my account" flows. **Effort: 1 day.**

### 2.3 Data classification

| Class | Examples | Storage | Encryption | Access |
|---|---|---|---|---|
| **Public** | Marketing site, ticker prices, news headlines | CDN | TLS | All |
| **Confidential** | Email, display name, portfolio holdings, P&L | Supabase ap-southeast-2 | AES-256 at rest, TLS in transit | Own user + admins |
| **Restricted** | Auth credentials, API keys, FIF/IRD numbers if provided | Supabase Vault / Render env vars | AES-256, never logged | System only |
| **Children's data** | Family role `child` portfolios | Same as Confidential + extra audit trail | Same | Family-adult + own user + admins |

---

## 3. NZ FMA compliance

InvestIQ does **not** currently hold an FMA licence. It is positioned as **tracking + analysis**, not advice.

| Requirement | InvestIQ today |
|---|---|
| **No buy/sell recommendations** | ✅ AI prompts explicitly forbid this; output uses "consider" / "review" language |
| **No personalised financial advice** | ✅ "Analysis only, not advice" disclaimer on every AI output, Tax section, and Insights section |
| **Suitability of advice** | N/A — no advice given |
| **Disclosure of conflicts of interest** | N/A — no third-party recommendations |
| **Risk warnings on volatile assets** | ✅ Disclaimers on crypto holdings, leveraged positions |
| **Anti-money-laundering (AML)** | ❌ No KYC today; would be required if InvestIQ became a broker |
| **PEP / sanctions screening** | ❌ Not implemented; needed if KYC introduced |
| **Record-keeping (7 years)** | ⚠️ Activity log retains data; no explicit retention policy |
| **Complaints handling** | ❌ No formal process documented |
| **External dispute resolution scheme** | ❌ Not registered (FSCL / FDR) — needed if licensed |

**Path to FMA-licensed:** If pivoting to advice/brokerage, partnership with a licensed entity (Harbour) shortcuts the licence requirement. Otherwise, ~6 months + ~$50k NZD to apply directly.

---

## 4. Personally Identifiable Information (PII) inventory

| PII element | Where stored | Why we collect | Retention | Deletable on request |
|---|---|---|---|---|
| **Email address** | Supabase Auth | Login + email digest | Until account deletion | Yes |
| **Display name** | `profiles.display_name` | Greeting + family view | Until account deletion | Yes |
| **Portfolio holdings** | `investiq_portfolios.portfolio` (JSON) | Core feature | Until account deletion | Yes |
| **Snapshot history** | `investiq_snapshots` | Performance over time | Until account deletion (or user-trimmed) | Yes |
| **Activity log** | `investiq_activity_log` | Audit trail | 365 days (planned) | Anonymised on account deletion |
| **Family relationships** | `families` + `family_members` | Household view | Until user leaves family | Yes |
| **AI analysis output** | `state.agentResults` (client + cloud) | Persisted across sessions | Until user re-runs or clears | Yes |
| **FIF / IRD number** | Optional — only if user enters | Tax form prep | User-controlled | Yes |
| **Bank balance (Akahu)** | Not yet integrated | — | — | — |
| **KYC documents** | Not yet collected | — | — | — |

We do **not** store: full names of dependants, addresses, dates of birth, government ID numbers (unless user opts in), phone numbers, photos, payment card details (Stripe handles those on Stripe side once wired).

---

## 5. Third-party processors

Every external service that touches user data:

| Processor | What's sent | Why | Region | DPA in place |
|---|---|---|---|---|
| **Supabase** (Auth + DB + Storage + Edge) | All user data | Core platform | AWS ap-southeast-2 (Sydney) | Supabase Pro DPA signed |
| **Anthropic** (Claude API) | Portfolio summary + market data for AI analysis | AI insights | US (us-east-1) | Anthropic standard DPA |
| **Render** (proxy hosting) | Request bodies pass through | API proxy | US-Oregon (us-west-2) | Render standard ToS |
| **Netlify** (frontend hosting) | Static asset serving only — no PII | Frontend | Global CDN | Netlify standard DPA |
| **Sentry** (error monitoring) | JS stack traces; user_id stripped before send | Bug detection | US (us-east-1) | Sentry standard DPA |
| **Resend** (email digest) | Email address + portfolio summary in body | Weekly digest | US | Resend standard ToS |
| **Yahoo Finance** (via proxy) | Ticker symbols only (no user identity) | Price data | US | Public API |
| **Harbour / Sorted.org.nz** (via proxy) | Fund codes only | NZ fund prices | NZ | Public scraping (no PII) |

**Cross-border data flows must be disclosed in the privacy policy.** Specifically: Anthropic (AI), Render (proxy), Sentry (errors), Resend (email) are all US-hosted.

---

## 6. Incident response (current state vs. needed)

| Step | Status | Action needed |
|---|---|---|
| **Detection** | ✅ Sentry + Supabase logs | — |
| **Triage classification (P0–P3)** | ❌ Not formalised | Document in `docs/INCIDENT_RESPONSE.md` |
| **Containment playbook** | ❌ Not formalised | Same |
| **Notification within 72hr (GDPR + NZ Privacy Act 2020 § 117 if "notifiable privacy breach")** | ❌ No process | Need: notification template, OPC reporting link, internal escalation path |
| **Post-incident review** | ❌ Not formalised | Blameless post-mortem template |

**Gap to close: 1 day** to author the playbook + a runbook for the most likely 3 incidents (proxy compromise, Supabase outage, data leak via misconfigured RLS).

---

## 7. Honest gap summary for the CEO meeting

If asked **"are we cyber-secure enough to handle Harbour clients?"** — the answer is:

> **"Foundationally yes — but not formally yet. The architecture is sound (RLS, encrypted at rest + in transit, secrets server-side, audit log on every change). What's missing is the formal layer that an enterprise auditor demands: a penetration test, SOC 2 Type 1 evidence, enforced 2FA, and a documented incident response plan. None of these are architectural changes — they're effort + budget items. Realistic timeline to client-ready: 4 months and ~$30-50k NZD."**

**The 5 most important controls to add before Harbour pilot:**

1. ✅ **Penetration test** by an NZ firm — ~$15-30k NZD
2. ✅ **2FA enforcement** for all users — 1 day
3. ✅ **CSP headers + Cloudflare WAF** — half-day + $20/mo
4. ✅ **GDPR/Privacy Act self-serve data export + delete** — 1 day
5. ✅ **Formal incident response plan + restore drill** — 1 day + ongoing

---

## 8. Review cadence

This document is reviewed:

- **Quarterly** by Gotham (Owner)
- **Before any release that touches auth, data flow, or third-party integration**
- **After any incident** (post-mortem updates the relevant control row)

Last reviewed: 2026-05-19.
Next review: 2026-08-19.
