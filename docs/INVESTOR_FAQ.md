# InvestIQ — Investor / CEO FAQ

_The 20 questions a Harbour CEO, CTO, or risk officer will ask in the meeting, and the honest answers._

Print this. Take it with you. Use it.

---

## Strategic / commercial

### 1. What is InvestIQ and who is it for?

A modern portfolio platform purpose-built for NZ retail investors. Three audiences:

1. **Self-directed investors** — track holdings across brokers, get AI-driven insights, NZ tax-aware (FIF + imputation).
2. **Households** — family aggregation lets parents see kids' KiwiSaver alongside their own ETFs.
3. **Active traders** — TraderIQ sibling app: trade journal + AI coach surfacing patterns in your decisions.

For Harbour: a foundation to build a Harbour-branded client portal that goes well beyond what Sharesight offers, with NZ-first features (FIF check, KiwiSaver fund unit price refresh, NZ Privacy Act compliant from day one).

### 2. How is this different from Sharesight, Stake, Hatch?

| Feature | Sharesight | Stake / Hatch | **InvestIQ** |
|---|---|---|---|
| Multi-broker tracking | ✅ | ❌ (single broker) | ✅ |
| AI-driven portfolio analysis | ❌ | ❌ | ✅ (4 agents) |
| NZ Tax (FIF, imputation, IR3) | ✅ | ❌ | ✅ |
| Family / household view | ❌ | ❌ | ✅ |
| Trade journal + AI coach | ❌ | ❌ | ✅ (TraderIQ) |
| Goals + projection | ❌ | ❌ | ✅ |
| Real-time news sentiment per ticker | ❌ | ❌ | ✅ |
| Open banking (Akahu) | ❌ | ❌ | 🚧 v0.17 |
| White-label / Harbour-branded | ❌ | ❌ | 🚧 v0.17 |
| Price | $20-30/mo | Free | TBD |

**Defensibility:** the AI insights layer is real and currently best-in-class for NZ. Sharesight has 12 years of head start on bookkeeping; we have a 12-month head start on AI-first investor experience.

### 3. What's the revenue model?

Three-tier SaaS:

- **Free**: 1 portfolio, 20 holdings, own AI key
- **Pro** ($10-15/mo): unlimited holdings, platform AI, alerts, weekly digest, multi-portfolio
- **Family** ($20/mo): everything in Pro + household aggregation, child accounts
- **Business / White-label** (custom): for partners like Harbour — multi-tenant, branded, adviser views, custom integrations

Plus: enterprise integration fees for Apex / Dynamics / Forms by Air wiring.

### 4. What does Harbour get out of partnering vs. building this in-house?

| Build in-house | Partner with InvestIQ |
|---|---|
| 18-24 months to MVP | Live demo today, white-label in 2-3 months |
| ~$2-3M build cost | <$500k partnership / white-label fee |
| Hiring 4-6 engineers | Uses existing team |
| Compliance lift starts from zero | NZ-aware compliance already baked in |
| AI capability needs to be built | AI capability ships with the platform |

### 5. Who's behind it? Can we trust this is more than a side project?

Honest answer: built by one person (Gotham Dinesh) over the past 12 months as a working NZ retail investor's portfolio tool. The codebase is production-quality (~14k lines, modular, well-documented). To scale to Harbour-client-grade we'd need: +1 senior engineer, fractional compliance person, ~$80-150k NZD/year in tools.

Partnership conversation would include team-building plan.

---

## Technical

### 6. What's the tech stack and is it production-grade?

- **Frontend**: Vanilla JS + Tailwind, modular (10 JS files, ~14k LOC total). No build step. Theme-aware (light/dark). Mobile-responsive (PWA-ready).
- **Auth + DB**: Supabase Pro (Postgres + RLS + Edge Functions + pg_cron). Same stack used by Slack, GitHub Copilot, 1Password, Mozilla.
- **API proxy**: Python on Render — keeps API keys server-side.
- **AI**: Anthropic Claude (Haiku for fast/cheap, Sonnet for deeper analysis, Opus for synthesis). OpenAI-compatible fallback already wired (LM Studio / Ollama / OpenRouter).
- **Email**: Resend.
- **Hosting**: Netlify Pro (frontend) + Render Starter (proxy) + Supabase Pro (data).
- **Monitoring**: Sentry.

**Production-grade?** Backend yes; frontend would benefit from a SvelteKit/Next.js migration before crossing 200 concurrent users. ~6 weeks of work, not a rewrite — just lifting the existing modules into a framework.

### 7. How secure is user data?

See `docs/COMPLIANCE.md` for the full register. Key points:

- Row-level security on every database table — users mathematically cannot see each other's data.
- Encrypted at rest (Supabase AES-256) and in transit (HTTPS everywhere).
- Secrets never in code — server-side only.
- Every state change logged to an audit trail.
- 2FA supported (not yet enforced — 1 day to wire).
- Penetration test not yet performed — needed for SOC 2.

Gap to enterprise-grade: 4 months + ~$30-50k NZD for pen test, SOC 2 prep, enforced 2FA, formal incident response.

### 8. What about NZ Privacy Act 2020 compliance?

Audited against all 13 Information Privacy Principles. Three gaps to close before paying NZ users sign on:

1. Self-serve "Download my data" export endpoint (1 day)
2. Self-serve "Delete my account" flow (1 day)
3. Updated Privacy Policy disclosing cross-border AI processing (Anthropic, US)

Notifiable Privacy Breach process not yet formalised — required by § 117 of the Act if any breach causes serious harm.

### 9. How upgradable / scalable is this?

| Layer | Today supports | Scale ceiling | Effort to lift ceiling |
|---|---|---|---|
| Auth + DB (Supabase) | ~10,000 users on Pro tier | ~100,000 users on Team tier ($600/mo) | Tier upgrade only |
| AI proxy (Render) | ~50 concurrent users | ~500 on Render Pro ($25/mo) | Tier upgrade |
| AI cost (Anthropic) | Variable — quota-gated per user today | Limited by token budget | Pricing tier design |
| Frontend (single HTML) | ~100 active users comfortably | Hits framework limits | 4-6 weeks SvelteKit migration |
| Daily snapshots | Unlimited (Supabase storage) | Unlimited | — |

Production target of 10,000 active users is achievable in current architecture with one frontend migration.

### 10. What integrations are wired today, and what's needed?

**Already demoable** (see `docs/INTEGRATIONS.md`):

- **Microsoft Dynamics 365** (outbound CRM) — Contact / Lead / PortfolioSnapshot entities, preview mode shipping today
- **Apex Clearing** (inbound broker data) — positions, transactions, account, reconciliation logic
- **Forms by Air** (inbound onboarding webhook) — KYC + risk profile + goal capture
- **Akahu** (open banking) — endpoint stub in proxy; activation requires Akahu partner cred

**Needs ~1-3 days each to wire real credentials.**

### 11. What's the AI doing exactly? Is it making financial recommendations?

No — and we're explicit about that legally. AI agents do:

- **Portfolio Health**: scores diversification 0-100 with bullet observations
- **Market Impact**: identifies which macro factors affect specific holdings
- **Risk Watcher**: flags concentration risk, FX exposure, liquidity issues
- **Opportunity Scout**: identifies underweight sectors (no "buy this stock" output)
- **Senior Advisor**: synthesises into a prioritised action plan with severity tags

Every output ends with a disclaimer: "Analysis only, not financial advice. Consult a licensed adviser before acting."

Prompts are designed to use "consider" / "review" / "monitor" language — never "buy" / "sell". This is NZ FMA-compliant for unlicensed analysis tools.

### 12. What happens if Anthropic / Render / Supabase goes down?

- **Anthropic down**: AI features unavailable, app degrades gracefully — all other features still work. UI shows "AI temporarily unavailable". 5-min Sonnet outage = no user impact beyond AI tab.
- **Render down**: Proxy down → no live prices, no AI. Cached data still visible. Anthropic redundancy possible via direct API in emergencies.
- **Supabase down**: Read-only mode using cached local data; new writes queued, sync on recovery. 99.95% uptime SLA on Pro.

Disaster recovery: Supabase daily backups (7-day retention), tested restore procedure documented in `docs/COMPLIANCE.md`. RTO target: 4 hours. RPO target: 24 hours.

---

## Compliance / risk

### 13. Do we need an FMA licence?

**Not for the current product** (tracking + analysis only, no advice, no order placement). But if InvestIQ becomes:

- **A broker** (placing orders) → yes
- **A financial adviser** (personalised recommendations) → yes
- **A KiwiSaver / managed fund issuer** → yes

The **partnership model** with Harbour shortcuts this: Harbour is licensed, InvestIQ provides the technology layer. Same model Sharesight uses with accounting firms.

### 14. What about IRD requirements?

InvestIQ does not process payments and is not a financial intermediary, so no IRD-specific filing requirement on us. We support users with:

- FIF income estimation (FDR method)
- Imputation credit tracking on NZ dividends
- IR3-ready CSV export (planned in v0.16+)
- 7-year retention of tax-relevant data (planned)

### 15. AML / KYC requirements?

Not required today (we're not handling money). Required if we become a broker. Akahu identity check or Onfido handles this cleanly when needed.

### 16. What's the data residency policy?

User data lives in **Supabase ap-southeast-2 (Sydney)** by default. This is privacy-act-compliant for NZ users. AI calls cross border to Anthropic US — disclosed in Privacy Policy. Render proxy also US — request bodies pass through (not stored).

If Harbour wants NZ-only data residency, options:

1. Self-hosted Supabase on Catalyst Cloud (NZ) — adds ~$2k/mo infra
2. Sonnet API redirect through a NZ-hosted proxy that strips identifiers before AI call

---

## Operational

### 17. What does it cost to run today?

| Service | Tier | Cost (NZD/mo) |
|---|---|---|
| Supabase | Pro | ~$40 |
| Render | Starter | ~$12 |
| Netlify | Pro | ~$30 |
| Sentry | Free | $0 |
| Resend | Free | $0 |
| Anthropic | Pay-as-you-go | ~$10-50 (variable on users) |
| Domain + email | — | ~$5 |
| **Total** | | **~$100-140/mo** |

Scales to ~1000 active users without changing tiers. AI cost is the variable — gated by per-user quota.

### 18. Who supports it? Who's on call?

Today: one person (Gotham), responsive within hours during NZ business time. Sentry alerts on critical errors.

For Harbour-grade: needs 24/7 on-call rotation. PagerDuty + 2-3 person on-call = ~$1k/mo + commitments. Realistic post-pilot.

### 19. What's the roadmap?

**Q3 2026 (next 90 days):**

- Compliance hardening: 2FA, CSP headers, Cloudflare WAF, pen test
- Stripe wiring for paid plans
- Sharesies + Hatch CSV import (the brokers most NZ users actually have)
- Mobile pass 8 (any remaining issues from real-world testing)

**Q4 2026:**

- Harbour-specific: white-label theming, SSO, adviser view, multi-tenant
- SOC 2 Type 1 evidence collection
- Frontend migration to SvelteKit

**Q1 2027:**

- Harbour pilot launch (50 invited clients)
- Akahu open banking live
- Apex Clearing live (read-only)
- Public marketing + scaling

### 20. What's the ask in this meeting?

Three options, depending on appetite:

1. **Light:** Approval to formalise partnership LOI + give InvestIQ access to Harbour test environments (Dynamics sandbox, Forms by Air access).
2. **Medium:** Above + commit to a 90-day technical pilot — 50 invited Harbour clients, white-labelled, with feedback loop.
3. **Heavy:** Above + capital investment / acquisition conversation — turn InvestIQ into Harbour's official retail client platform.

Each is achievable in different timeframes. **Recommend starting with light.**
