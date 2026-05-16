# InvestIQ — Pitch Brief

_Strategic + product narrative. Source material for slides, leave-behinds, and conversations. Not a deck itself — written so individual sections can be lifted into whatever format the audience needs._

Last updated: 2026-05-16

---

## 1. Executive summary

**InvestIQ is a portfolio dashboard built natively for the New Zealand retail investor.**

Every existing tool treats NZ as an afterthought — Sharesight is Sydney-based and tags FIF as a paid add-on; Yahoo Finance doesn't index NZX 50 cleanly; spreadsheets break under multi-currency weighted-average cost basis. InvestIQ starts from the assumption that the user is in Auckland, has KiwiSaver, holds Harbour and Milford funds, gets paid in NZD, and pays NZ tax under FIF or PIE rules.

It already does what's hard:

- Consolidates eToro, Sharesies, Harbour Asset Management, Indus, ANZ NZ, BNZ, and any KiwiSaver scheme into one view
- Live prices, FX-corrected to NZD with LSE pence normalisation baked in
- NZ tax-aware: FIF threshold detection, PIE treatment of NZ funds, audit-ready snapshots
- Multi-agent Claude AI (Haiku + Opus) producing daily briefings, per-holding deep-dives, and synthesised action plans
- Family platform: hierarchical visibility, 5 roles, aggregate household views, kid + spouse + accountant access

It's built lean: ~11,000 lines of code, ~$51/mo USD all-in infrastructure, ships a tagged release every 1-2 days, fully documented, scales to ~500 users on current infra without any architectural change.

**The pitch:** with the foundation already in place, the next 6-12 months unlock genuine moats — proprietary AI instructions, NZ-native managed-fund coverage, Stripe-based family pricing, bank/KiwiSaver direct-sync via Akahu, white-label opportunity for Harbour and similar firms.

---

## 2. What's already built (status: working, deployed, tagged)

| Area | Feature | Status |
|---|---|---|
| **Portfolio** | Multi-platform consolidation, weighted-avg cost basis, multi-currency FX, LSE-pence normalisation | ✅ Live |
| **NZ tax** | FIF threshold check with FDR 5% method, PIE exclusion for NZ funds, snapshot audit trail | ✅ Live |
| **Live data** | Yahoo Finance via Python proxy on Render, 5-min auto-refresh, CORS fallback chain | ✅ Live |
| **Multi-source news** | 8 RSS feeds (RNZ, Stuff, NZ Herald, BBC, MarketWatch, CNBC, Investing, Guardian) | ✅ Live |
| **AI agents** | 4-agent pipeline — Haiku Portfolio Health + Market Impact + Opportunity Scout, Opus Advisor synthesises | ✅ Live |
| **AI Daily Brief** | Morning 3-bullet briefing on what's moving in markets vs your portfolio | ✅ Live |
| **Holding Detail page** | 1y price chart + per-lot P&L + Claude per-holding analysis + ticker news | ✅ Live |
| **Benchmark overlay** | Portfolio vs NZX 50 / S&P 500 / NASDAQ / FTSE / ASX 200 on % return basis | ✅ Live |
| **NZ Fund + KiwiSaver** | Manual unit prices for all 18 major NZ providers (Harbour, Milford, etc.) with staleness indicators | ✅ Live (manual entry; auto-fetch planned) |
| **Family platform** | 5 roles, hierarchical RLS, email + 6-char-code invites, aggregate household view | ✅ Live |
| **Price alerts** | Per-ticker or whole-portfolio email triggers with 24h cooldown, scheduled every 30 min | ✅ Live |
| **Weekly digest** | Monday-morning email summary via Resend, opt-in | ✅ Live |
| **Daily snapshots** | Automatic portfolio history written daily, time-travel through any past date | ✅ Live |
| **Daily DB backups** | Edge Function dumps all 8 tables to Supabase Storage nightly, 30-day retention, full restore playbook | ✅ Live |
| **Error monitoring** | Sentry frontend SDK with privacy scrubbing (no user IDs/emails leak to Sentry) | ✅ Live |
| **Auth + multi-tenant** | Supabase Auth + RLS on every table + admin approval gate + 30-min idle timeout | ✅ Live |
| **Mobile UX** | Sticky portfolio summary, card-flow tables, 40px tap targets, native modal patterns | ✅ Live |

8 tagged releases shipped, all documented in `docs/TODO.md` "Recently completed" sections.

---

## 3. What makes it different — competitive moat

### vs Sharesight ($20-$50/mo NZD)

| Dimension | InvestIQ | Sharesight |
|---|---|---|
| Origin | NZ-native | AU-built, NZ as add-on region |
| FIF tax handling | Built-in, free | Add-on tier |
| NZ Managed Funds | All 18 providers, ready for auto-fetch | Limited list, US-fund focus |
| KiwiSaver | First-class holding type | Tracked as generic fund |
| Family / household view | Built-in, hierarchical | Per-portfolio only, separate logins |
| AI agents | Multi-model (Haiku + Opus), portfolio-aware | None |
| News aggregation | 8 sources + AI-summarised daily brief | None |
| Per-holding deep-dive | 1y chart + AI analyst review | Basic |
| Open architecture | Self-host option exists | Closed SaaS |

### vs Yahoo Finance / Google Sheets

- **Multi-platform automated import** vs manual spreadsheet rebuilds every CSV
- **Live FX conversion** without VLOOKUP gymnastics
- **Audit trail** via daily snapshots — Sheets has no time travel
- **NZ tax math** out of the box
- **AI** that knows what you actually own

### vs Hatch / Sharesies in-app tracking

- **Whole-of-life view** — not just one broker's holdings
- **Cross-platform aggregation** — eToro + ANZ + Harbour + KiwiSaver in one place
- **Family** — Hatch is single-user only

### The differentiator that ages well

Most fintech moats are network effects or data scale. InvestIQ's moat is **NZ-specific domain knowledge encoded into product**. FIF math, PIE-vs-FIF disambiguation, LSE pence normalisation, multi-currency weighted-avg cost across providers — these are decisions that took thinking. A US-built competitor entering NZ would spend 6 months building what's already shipped.

---

## 4. Architecture credibility

For technical audiences who want to know it's real. Full architecture in `docs/ARCHITECTURE.md`.

```
Browser (investiq-nz.netlify.app)
  ├── Direct → Supabase (auth + DB + Edge Functions + pg_cron)
  └── Proxy → Render (Python) → Yahoo / Anthropic / 8× RSS / Akahu

Scheduled jobs:
  └── pg_cron → Edge Function → Resend → user inbox
```

| Layer | Tech | Why this choice |
|---|---|---|
| Frontend | Vanilla JS + Tailwind CDN | No build step, instant deploys, infinite static-edge scale |
| Auth + DB | Supabase Pro | RLS-first multi-tenancy; we never wrote a "who can see this" check in JS |
| API proxy | Python on Render | Yahoo + Anthropic via single auth gate; replaceable with Supabase Edge Functions |
| AI | Anthropic Claude | Haiku for cheap parallel fan-out, Opus for synthesis — model-per-role rationale in `MODEL_SELECTION.md` |
| Email | Resend | Free 100/day, scales smoothly to paid; transactional only |
| Monitoring | Sentry | Free 5k events/mo; privacy-aware beforeSend strips PII |
| Cost today | ~$51 USD/mo flat | Doesn't grow with users until ~500 DAU (per `SCALING.md`) |

**Security posture:** 5 Critical items audited; service-role keys never leave Supabase; idempotent migrations; tagged releases for rollback; daily DB backups; SECURITY.md tracks 5 Critical + 10 High + 10 Medium risks with mitigation paths.

**Operating discipline:** 1 sole developer + AI guide. Working agreement in `CLAUDE.md` (portable to other projects). Pre-commit checklist. Two-strikes-and-out rule. End-to-end testing before "done". Tagged releases (v0.4 through v0.7d in 30 days).

---

## 5. Roadmap by horizon

### Near-term (next 90 days)

| Quarter | Feature | Strategic value |
|---|---|---|
| Now | NZ Fund auto-fetch via Sorted.org.nz | Removes the only friction in NZ-fund tracking — instantly differentiates from manual-only competitors |
| Now | NZ Dividend tracking | Full RWT + foreign withholding + imputation credit tracking. IR3-ready export. Currently no NZ tool handles this cleanly |
| Now | Tax Loss Harvesting | Scans for FIF offset opportunities. NZ-specific, Sharesight charges for this |
| Now | FIF Comparative Value method | Many investors save tax under CV vs FDR. Show both, flag better. |
| Now | Sentry custom-domain email sender (Resend) | Required before non-friend signups |
| Now | Terms of Service + Privacy Policy | NZ Privacy Act 2020 compliance gate for public launch |

### Medium-term (90-180 days)

| Feature | Strategic value |
|---|---|
| **Stripe paywall with family-inclusion pricing** | Differentiator: most apps gate by AI usage. InvestIQ gates by *household* — Free (solo), Pro $8/mo (solo + AI + alerts), Family $15/mo (up to 6 members, aggregate view, joint goals). Drives ARPU through household value, not feature gating |
| **Bank + KiwiSaver direct sync via Akahu paid tier** | Open-banking integration ($150-300/mo wholesale). Live ANZ / BNZ / Sharesies / KiwiSaver position pulls eliminate CSV imports. Premium feature |
| **Proprietary AI instructions** | Move agent prompts from public GitHub to Supabase Vault. Agents become a closed-box API surface; prompts become defensible IP |
| **PWA / installable** | Phone home-screen icon, push notifications, offline cache |
| **NZ news + research integration with provider partners** | Harbour, Milford, Fisher Funds commentary surfaced directly in agent context |

### Long-term (180-365 days)

| Feature | Strategic value |
|---|---|
| **Real-time advisor support** | Optional live-chat or video escalation when an alert fires (paid tier). Could be human-in-the-loop or AI-first. (Speculative at this stage — depends on partner reception) |
| **Multi-tenant SaaS for advisor firms** | White-label "Harbour Portfolio Tracker, powered by InvestIQ" for fund managers' direct clients. Per-firm dashboards, branded emails |
| **Tax export → Xero / accountant CSV** | NZ accountants live in Xero. One-click sync of FIF + dividend + realised gains into Xero accounts |
| **Goal-based projection engine** | KiwiSaver-at-65 modelling, First Home Withdrawal eligibility, target net-worth tracking with on/off track banner |
| **Sharable read-only portfolio links** | Send to accountant/advisor, time-limited token, no login needed |

---

## 6. Business model — three revenue paths

### Path A — Consumer freemium (default)

| Tier | Price | Includes | Target |
|---|---|---|---|
| **Free** | NZ$0 | 1 user, 20 holdings, manual refresh, basic FIF check | Lead-gen, casual users |
| **Pro** | NZ$8/mo | Unlimited holdings, AI agents, price alerts, weekly digest, full FIF + CV methods, tax export | Serious solo investors |
| **Family** | NZ$15/mo | Pro × 6 members, aggregate household view, joint goals, family digest, kids' custodial accounts | Households, NZ-first market |
| **Family Plus** | NZ$25/mo | Family + Akahu live-sync (banks + KiwiSaver), priority alerts, optional advisor referral | High-end retail |

Notes:
- Family-pricing tier is the differentiator. Most apps charge per AI usage or per user. Charging per *household* better reflects how NZ retail investors actually live.
- At 500 paying users mixed across tiers: ~NZ$5k MRR. Modest indie-developer income; covers infra + a part-time co-dev.

### Path B — B2B white-label

Sell to NZ wealth firms / fund managers / KiwiSaver providers. Customer pays a per-end-user license fee; their clients see a branded version.

**Harbour Asset Management as launch partner:**
- Harbour has thousands of fund holders who currently track investments in spreadsheets / Sharesight
- White-label "Harbour Investor Hub" surfaces Harbour fund prices natively, plus consolidated view of every other holding the client has
- Harbour gets: stickier client relationships (clients log in daily not yearly), proprietary research embedded in AI agent context, lead-gen funnel for Harbour funds (clients see allocation gaps Harbour funds could fill)
- Pricing model: per-client annual fee (e.g. NZ$30 per active user per year). For ~5k active Harbour fund holders: NZ$150k ARR from one customer
- Could scale to Milford, Fisher Funds, Generate, Booster — total addressable: ~250k engaged NZ retail investors across NZ fund providers

### Path C — Affiliate / referral

Lightweight: agreements with brokers (Hatch, Sharesies, Tiger Brokers NZ) to refer InvestIQ users opening new accounts. Lower-friction monetisation; doesn't require Stripe at first.

---

## 7. Why Harbour Asset Management specifically

### What Harbour's clients struggle with today

- Tracking Harbour fund unit prices alongside their other investments (Sharesies, eToro, KiwiSaver elsewhere, ANZ term deposits)
- Calculating their PIE tax obligations correctly (Harbour reports to IRD on their behalf but clients want self-visibility)
- Understanding how Harbour funds contribute to total NZ-equity exposure when they also hold NZX 50 ETFs separately
- Knowing when their Harbour fund holdings cross thresholds — concentration limits, rebalance triggers
- Surfacing Harbour's own commentary at the moment a client is making a decision

### What InvestIQ × Harbour solves

- **Native unit price tracking** for all Harbour funds, kept current automatically via Sorted.org.nz pipe (Q1 build) or Harbour direct feed (Q2 build with partnership)
- **PIE-aware tax view** showing Harbour fund income separated from FIF-zone investments
- **AI agent prompts customised** with Harbour's research and house views — clients ask "should I rotate from US tech to NZ utilities?" and the AI references Harbour's published commentary, not generic web sources
- **Branded white-label** — "Harbour Investor Hub" lives at `app.harbour.co.nz`, looks like Harbour, has the same product depth as InvestIQ
- **Cross-portfolio context** — Harbour sees (in aggregate, anonymised, opt-in) how its funds fit into clients' broader portfolios. Insight goldmine for product + marketing.

### What Harbour gives

- Launch customer credibility (lets InvestIQ enter the NZ wealth space)
- Brand partnership (compounds trust)
- Direct distribution to Harbour's client base
- Optionally: technical input on PIE / FIF / unit-price feed
- Optionally: equity / revenue share / sponsorship of the platform

### Order of magnitude

If Harbour onboards 2,000 of its ~10k+ existing fund holders to a white-label version at NZ$30/user/year:
- Year 1 ARR: NZ$60k
- Year 2 with 5,000 users + commentary tier: NZ$200k+
- Plus indirect: reduced churn on Harbour funds, lead-gen for new funds, marketing differentiation

The cost to Harbour to build this in-house from scratch: 12-18 months × 3 engineers × $150k = ~$500k+. Buying it through a partnership with InvestIQ is dramatically cheaper and faster.

---

## 8. Why wider scale works (TAM)

### NZ retail investor universe

- **Total adult population:** 3.9M
- **KiwiSaver members:** 3.3M (every adult basically) — every one of them has a portfolio they're under-tracking
- **Active retail brokerage accounts:** ~600k (Sharesies 700k+ accounts incl. duplicates; Hatch ~150k; ASB/ANZ direct ~100k)
- **People who actively track multi-platform holdings:** ~50-100k (Sharesight has ~25k NZ users; spreadsheets are the rest)
- **Households with NZ$50k+ overseas (FIF zone):** ~70k per IRD data

### Realistic conversion path

- Year 1 target: 500 paying users, mostly word-of-mouth + one B2B partner (Harbour or similar) — NZ$5k MRR + $60k ARR
- Year 2: 3,000 paying users + 2 B2B partners — NZ$30k MRR + $300k ARR
- Year 3: 10,000 paying users + 4 B2B partners — NZ$100k MRR + $1M+ ARR

These are conservative for the NZ-only market. Adding Australia (similar tax pain with managed funds + super, larger investor base) doubles addressable.

### Beachhead defensibility

The longer InvestIQ runs:
- Snapshot history accumulates → users can't easily migrate without losing their audit trail
- AI agents become trained on user feedback (which suggestions worked, which were ignored)
- Family connections create switching cost (4 people in a family won't all change apps simultaneously)
- B2B contracts lock in 12-24 month commitments
- Brand recognition in the NZ-finance Twitter / Reddit / Substack scene

---

## 9. The AI angle — proprietary moats over time

### Today (public-prompt phase)

AI agent system prompts live in `standalone/js/70-ai.js` — readable on GitHub. Six agents:

- **Portfolio Health** (Haiku) — diversification + concentration + Health Score regex contract
- **Market Impact** (Haiku) — 3 macro factors hitting THIS portfolio + sentiment
- **Opportunity Scout** (Haiku) — gaps + specific tickers to fill them, NZ-context aware
- **Senior Advisor** (Opus) — synthesises above three into 5-action plan
- **Daily Brief** (Haiku, on-demand) — 3-bullet morning briefing
- **Holding Deep-Dive** (Sonnet, on-demand) — 4-section per-holding review

These are decent but not defensible — anyone can read them.

### Q2 (proprietary-prompt phase)

Move all prompts to Supabase Vault. Frontend calls `/agents/run` Edge Function → function reads prompts from Vault → calls Anthropic → returns formatted response. **Prompts never reach the browser.** Effectively closed-box AI.

Layered on top:
- **A/B prompt testing** infrastructure — variant A served to 50%, variant B to 50%, dashboard tracks which produces better engagement / fewer "this is wrong" feedback
- **User-feedback fine-tuning** — every agent response has thumbs up/down. Aggregated signal informs next prompt iteration
- **Provider-specific prompt overlays** — Harbour clients' agents include Harbour-flavoured tone + Harbour commentary references. Milford clients see Milford context. White-label means agents become locally-tuned

### Q3-Q4 (proprietary-model phase, ambitious)

Fine-tune a small model (Llama 3 8B or similar) on NZ tax + market context. Run on Render or self-hosted GPU. Two advantages:
- **Latency**: <500ms responses vs Anthropic's 2-5s
- **Cost**: $0.001 per call vs Anthropic's $0.05+
- **Customisation**: full control of NZ-specific behaviour

Optional. Anthropic-routed agents work fine if costs stay bounded; fine-tuning is an optimisation if a paid tier has high per-user usage.

---

## 10. Risks — honest pitch credibility

| Risk | Mitigation |
|---|---|
| **Solo developer** | Documented to the point another dev / LLM can pick up cold. Already shipping 1-2 features per session with no help. Will hire / partner once revenue justifies. |
| **No paying users yet** | Beta phase. Pre-revenue but post-architecture. Harbour partnership is the natural launch customer. |
| **Yahoo Finance dependency** | Already have CORS fallback + manual unit price for NZ funds. Alpha Vantage / IEX paid as drop-in. Akahu paid tier as orthogonal source for bank holdings. |
| **AI cost runaway** | Spend cap on Anthropic Console (C1). Per-user quota in profiles table. Cron-rate-limited alerts. |
| **Supabase / Render / Anthropic price changes** | Multi-vendor: data on Supabase, proxy on Render, AI on Anthropic. Any one can be replaced without rewriting the others. Supabase Edge Functions can absorb the proxy if needed. |
| **NZ market is small** | True — but Sharesight is a $50M+ ARR business built on the same tier of users. Plus Australia + Pacific Islands expansion natural. |
| **Regulatory** | FMA-compliant vocabulary baked in (`GUARDRAILS.md`). No "advice", only "information". Future: financial adviser referral integration (not in-house advice) |
| **Trust / data sensitivity** | RLS on every table, daily backups, idle timeout, sole developer + AI guide signed working agreement (`CLAUDE.md`). Move to SOC 2-friendly hosting once first B2B customer requires it. |

---

## 11. The ask

### From Harbour specifically

Three escalating levels of partnership:

**Level 1 — Sponsorship / pilot**
- 6-month pilot with 50-100 Harbour clients on the existing platform
- Harbour funds get first-class treatment in product (unit prices, commentary integration)
- InvestIQ + Harbour co-write the case study
- Cost to Harbour: minimal — marketing + intro emails to selected clients
- Value to InvestIQ: launch customer credibility, user feedback, partnership reference

**Level 2 — White-label**
- Harbour licenses InvestIQ to power a Harbour-branded portfolio tool
- 12-month contract, per-active-user fee
- Harbour's commentary integrated into AI agent context
- Cost to Harbour: ~NZ$60-150k Y1 depending on usage
- Value to Harbour: client retention, differentiation vs Milford / Fisher Funds, data insights on client portfolios

**Level 3 — Strategic investment**
- Equity / convertible note from Harbour into InvestIQ
- Harbour gets right of first refusal on competitive partnerships
- InvestIQ accelerates NZ wealth-management focus
- Cost to Harbour: $X (TBD)
- Value: long-term play, exit alignment, deep partnership

### From wider firms

Different conversations with: Milford (similar to Harbour, fund-manager B2B), Sharesies (consumer-tier; partnership or acquisition target), Hatch (broker-tier; affiliate or acquisition target), Generate / Booster (KiwiSaver-focused; B2B), Xero (accountant ecosystem; integration partner).

---

## 12. What you actually take to a meeting

This brief is the briefcase. From it you'd lift:

**For Harbour leadership (30-min meeting):**
- Section 1 (exec summary) → opening slide
- Section 7 (Harbour-specific) → meat of the pitch
- Section 11 (3 partnership levels) → close

**For Harbour technical team:**
- Section 4 (architecture) → 10-min walk-through
- Section 9 (AI moats) → why partnership > build-in-house
- Section 10 (risks) → credibility check

**For consumer-side investors / accelerators (50% chance you go this path):**
- Section 6 (business model) → ARPU math
- Section 8 (TAM) → market size justification
- Section 5 (roadmap) → near-term execution credibility

**For NZ fintech / RSO conferences (15-min talk):**
- Section 2 (what's built) → demo flow
- Section 3 (competitive moat) → why NZ-native
- Section 11 ask (open question on partnership models)

---

## 13. Open questions / what you're still figuring out

Honest list — these aren't answered yet, and pretending they are weakens the pitch:

1. **Name + brand** — "InvestIQ" might face trademark issues per earlier IPONZ search (Investec, InvestNow, etc.). Rebrand pending Claude Design exploration.
2. **Solo-developer dependency** — at 100 paying users it's fine, at 1,000 it's a bottleneck. Co-founder / first hire decision: when, who, what skills.
3. **Equity / sponsorship vs revenue-first** — depends on what Harbour (or first real customer) offers. Bootstrapped → indie path. Equity → larger play.
4. **Pricing precision** — the $8 / $15 / $25 split is intuition not data. First 50 users will tell you whether to compress or expand.
5. **Akahu paid tier ROI** — $150-300/mo is real fixed cost. Worth it only if ~30+ paying users care about live bank sync.
6. **Mobile-app vs PWA** — full native (React Native / Flutter) is months of work. PWA is days. Decision deferred until consumer scale demands it.
7. **B2B vs consumer focus** — both directions work but require different sales motions. Harbour pitch tests B2B; consumer signup waitlist tests B2C demand. Run both for 90 days, pick.

---

## How to update this file

- After every meaningful customer / partner conversation that changes positioning
- When pricing model changes
- When a new differentiator gets built or removed
- After any pivot (technical, market, strategic)
- Each release tag is a chance to re-check whether the "what's already built" table matches reality

Versioned in git alongside the rest. Treat it as the single source of truth for strategic narrative. Slides + decks reference back here, not the other way around.
