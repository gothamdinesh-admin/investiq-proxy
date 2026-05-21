# InvestIQ Live Demo Script

_Target length: 7 minutes · Aim: leave the room saying "I want to use this"_

Print this. Practice it twice before the meeting. Time yourself.

---

## Pre-demo setup (do 5 minutes before walking in)

- [ ] Open `https://investiq-nz.netlify.app/` in Chrome
- [ ] Sign in as `gothamdinesh@gmail.com` (admin) — has the rich demo data
- [ ] Run **Refresh prices** so live data is fresh
- [ ] Open Performance tab once so the snapshot chart is pre-rendered
- [ ] Open AI Insights tab once so KPIs are populated (or run agents 10 min before)
- [ ] Have `docs/COMPLIANCE.md`, `docs/INVESTOR_FAQ.md`, `docs/INTEGRATIONS.md` open in separate tabs as backup proof
- [ ] Phone ready for the mobile slice of the demo
- [ ] Loom backup video URL ready on your phone in case WiFi dies (see `LOOM_STORYBOARD.md`)

---

## The 7-minute script

### Beat 1 — Overview (60 seconds)

> **Say:** "Let me show you InvestIQ. Three audiences — self-directed NZ investors, households, and active traders. We're on the Overview page."

**Show:**

- Top: greeting + portfolio total + portfolio score ring
- Sidebar: Today's Movers (clickable)
- Allocation donut chart
- Performance bar chart (top 5 winners + 5 losers)
- Bottom: Today's biggest moves card

**Key line:**

> "This is what an NZ retail investor sees the moment they sign in. Their actual portfolio, their score, what moved today. Built mobile-first." *(switch to phone briefly, show same view, switch back)*

### Beat 2 — AI Insights, the "wow" moment (90 seconds)

> **Say:** "Where it gets interesting — AI Insights. Four specialist agents analyse the portfolio in parallel."

**Click:** **AI Insights** in the sidebar.

**Show:**

- 4 KPI tiles at the top: Portfolio Health, Risk Level, Market Sentiment, Opportunities
- Hero card with score ring + "30-day focus"
- **Prioritised Action Items** with severity-tagged chips (Critical, High, Medium, Low, Watch)
- The 4 collapsible agent reports below

**Click:** any tile (e.g. "Risk Level") — show it jumps to the matching agent report and pulse-highlights it.

**Key line:**

> "No other NZ tool does this. The investor gets a prioritised action list with severity tags, all generated from their actual holdings. We use Claude — Haiku for the specialists, Opus for the synthesis. About 4,000 tokens per run, ~10 cents."

### Beat 3 — Goals & Targets (45 seconds)

> **Say:** "Goals turn 'I should save more' into a number on a calendar."

**Click:** **Goals** in the sidebar.

**Show:**

- A goal card (e.g. "Retirement · $1.5M by 2050")
- On Track / Off Track pill
- Progress bar
- Projection assuming current value + monthly contributions + assumed return
- "Catch-up" suggestion if off-track

**Key line:**

> "Engagement loop. They check in to see whether they're on track. Goals can be scoped to whole portfolio, single asset class, or single ticker."

### Beat 4 — Family aggregation (30 seconds)

> **Say:** "And because households are the unit, not individuals —"

**Click:** **Family** in the sidebar.

**Show:**

- Household total across all members
- Per-person breakdown
- Adult / teen / child / viewer roles

**Key line:**

> "Parents can see kids' KiwiSaver alongside their own ETFs. Adults see everyone, teens see their own + read-only of household, children see only themselves. Privacy controls are real."

### Beat 5 — TraderIQ sibling app (45 seconds)

> **Say:** "For active investors, there's TraderIQ — sibling app, same login."

**Click:** **TraderIQ** in the sidebar.

**Show:**

- 5 KPI tiles: Win Rate, Total P&L, Expectancy, Profit Factor, Avg Hold
- Equity curve chart
- Setup Performance breakdown
- Trade journal rows

**Key line:**

> "Trade journal + AI coach. The coach analyses your patterns: 'your Breakout setup wins 71% but you only took 7 — scale this up.' Nobody else in NZ ships this."

### Beat 6 — The integration story (90 seconds — THE MONEY SHOT)

> **Say:** "Now the bit that matters for Harbour. We've built integration stubs for the systems you'd want this talking to."

**Click:** **Admin Panel** (visible because you're signed in as admin).

**Show in sequence:**

**a) Click "Test Dynamics 365 Sync"** — output box shows:

- Contact entity payload (with custom `investiq_*` fields)
- Lead entity payload
- PortfolioSnapshot entity payload
- Proxy round-trip confirmation

> "Three canonical Dynamics entities. Pushed via our proxy so Azure AD credentials never touch the browser. Production-safe — won't write to a real tenant until creds are configured."

**b) Click "Test Apex Sync"** — output shows:

- Mock positions from Apex
- Mock transactions
- Account balance
- **Reconciliation diff** vs the user's current portfolio

> "Pulling broker-side data from Apex Clearing. We reconcile against what we already have — flag mismatches. Production: one nightly cron, automatic."

**c) Click "Test Onboarding Webhook"** — output shows:

- Full Forms by Air sample submission
- Field-mapping the proxy applies
- Would-create Goal + would-update Profile fields

> "Forms by Air webhook receiver. New signups land with risk profile and first goal already populated. KYC questions, PEP check, T&Cs — all captured at the form level."

**Key line:**

> "All three are demoable today, all three flip from 'preview mode' to 'live writes' the moment you give us the credentials. Documented in detail in `docs/INTEGRATIONS.md` — happy to walk through that with your engineering team after this."

### Beat 7 — The compliance & roadmap close (60 seconds)

> **Say:** "Two more things before I stop."

**Open** `docs/COMPLIANCE.md` in browser.

> "First — compliance. This is our control register. Cyber, NZ Privacy Act, FMA stance, PII inventory, third-party processors, incident response. Honest about what we have, honest about what's missing — pen test, SOC 2, enforced 2FA. None are architectural; they're effort plus budget. Realistic timeline to client-grade: 4 months, around $30-50k NZD."

**Switch to slide / screen** with the roadmap.

> "Second — roadmap. Q3 we close the compliance gaps and wire Stripe. Q4 we ship Harbour-specific: white-label, SSO, adviser view, multi-tenant. Q1 next year, Harbour pilot launches with 50 invited clients."

> "What we're asking for today is the lightest of three options: an LOI plus access to Harbour test environments so we can wire real credentials and come back in 30 days with a fully live integration demo."

---

## The 3 hard questions you'll get (rehearse answers)

### Q: "Is this just you? Can it scale?"

> "Today, yes — but the architecture absolutely scales. Backend (Supabase) handles 10,000+ users without changes. AI cost is variable but quota-gated. The frontend needs a SvelteKit migration before crossing ~200 concurrent users — that's 6 weeks of work, already planned. For Harbour-grade we need one more senior engineer plus fractional compliance support. Partnership budget covers that."

### Q: "What if Anthropic changes their pricing or shuts down?"

> "Architecturally, we support OpenAI-compatible APIs as a fallback today — LM Studio, Ollama, OpenRouter, Mistral. We could swap the AI provider in a sprint if needed. The prompts are model-agnostic. We use Anthropic because the quality-per-dollar on Haiku is currently unmatched."

### Q: "What's your defensibility? Couldn't someone copy this?"

> "Three layers. First, the AI prompts and agent orchestration took 6 months to tune — that's actual IP. Second, the NZ-specific compliance and tax logic (FIF, imputation, IR3 prep, KiwiSaver fund refresh) is hard for a US-built tool to replicate. Third, time-to-market — we're live today, a competitor needs 18-24 months. By the time they ship, we'd have Harbour distribution and a moat of users."

---

## Anti-fail checklist

- [ ] If WiFi dies → switch to Loom backup video
- [ ] If AI agents fail to run live → use the cached results from your pre-demo run
- [ ] If a chart looks weird → don't fix it live; pivot to the next surface
- [ ] If asked something you don't know → "Great question — let me come back to you on that within 24 hours" (then actually do)
- [ ] If they want to look at code → open the GitHub repo, walk them through `js/70-ai.js` (AI agents) + `js/95-integrations.js` (integration adapters)

---

## Post-demo follow-up email template

> Subject: InvestIQ demo recap + next steps
>
> Hi [name],
>
> Thanks for the time today. As discussed, here's the package:
>
> - The live app: https://investiq-nz.netlify.app
> - Compliance register: [link to PDF export of COMPLIANCE.md]
> - Integration architecture: [link to INTEGRATIONS.md]
> - Investor FAQ with the questions you raised: [link to INVESTOR_FAQ.md]
>
> Three concrete next steps based on what you said:
>
> 1. **By [date + 7]** — I'll send you a draft LOI for Harbour test-environment access.
> 2. **By [date + 14]** — Once I have Dynamics sandbox credentials, I'll come back with a fully live integration demo (not preview mode).
> 3. **By [date + 30]** — Joint go/no-go meeting on the 90-day pilot.
>
> Anything I can clarify in the meantime — happy to jump on a call or send more detail.
>
> Cheers,
> Gotham
