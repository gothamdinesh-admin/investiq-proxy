# Loom Backup Video — Storyboard & Recording Guide

_Use case: WiFi dies in the meeting, projector hates you, or you want to send the demo to people who couldn't make it._

I can't record video for you, but here's the shot list — record once and you've got a perfect 7-minute reproducible demo. Loom (free tier) does this in one take with no editing needed.

---

## Before you record

### 1. Tools (5 min setup)

- Install **Loom** desktop app (loom.com/download)
- Sign up free — free tier gives 5 min per video; **upgrade to Starter ($12/mo)** for 8 min HD recordings + downloads. One month, cancel after.
- Test recording with a 30s throwaway to check audio levels

### 2. Demo state setup

Run through `DEMO_SCRIPT.md` pre-demo checklist:

- [ ] Sign in as admin
- [ ] Refresh prices so live data is fresh
- [ ] Pre-load Performance (so the chart renders)
- [ ] Pre-run AI agents (so KPIs + reports are populated — Insights section)
- [ ] Goals: at least 1 active goal in place
- [ ] TraderIQ: at least 5 closed trades so the equity curve has data
- [ ] Family: 2+ members so the household view has content
- [ ] All sections "warm" so no spinners during recording

### 3. Browser setup

- Chrome, 1920×1080 window (full screen)
- Hide bookmarks bar: `Ctrl+Shift+B`
- DevTools closed
- Zoom: 100% (`Ctrl+0`)
- Move mouse pointer slowly during recording — easier to follow

### 4. Audio setup

- Quiet room, close doors
- Use a USB mic or AirPods if possible (laptop built-in is OK but noisy)
- Speak slightly slower than normal — viewers can re-play, no need to rush
- Brief pause between beats — easier to re-cut later if needed

---

## Recording shot list (8 minutes total — fits Loom Starter)

Each shot is ~30-90 seconds. **Don't pause the recording between shots** — record straight through. Re-record only if a shot bombs.

### Shot 1 (0:00 – 0:30) — Cold open

**Camera:** screen + your webcam thumbnail in the corner.

**Action:** Open the homepage (`investiq-nz.netlify.app`), already signed-in dashboard visible.

**Say:**

> "Hi — I'm Gotham. This is InvestIQ. A portfolio platform built for NZ investors. I'm going to walk you through the dashboard, the AI insights, the integrations we've built for the Harbour stack, and the compliance posture. About seven minutes."

---

### Shot 2 (0:30 – 1:30) — Overview

**Camera:** screen full.

**Action:**

- Mouse over portfolio total (NZ$22,330) and the score ring
- Hover over Today's Movers tickers in the sidebar
- Show the Allocation donut → toggle Type / Platform / Sector tabs
- Show the Performance bar chart (top winners + losers)
- Click one tile (e.g. Total Value) to show clickable tiles

**Say:**

> "Overview. Portfolio value, AI-driven score, today's movers down the side, allocation by type/platform/sector, and the top winners and losers today. Every tile is clickable — Total Value jumps to Holdings, Total Return jumps to Performance, and so on. Built mobile-first."

**Slip in a phone shot:** brief tilt of your phone showing the same view — Loom will pick it up via webcam.

---

### Shot 3 (1:30 – 3:00) — AI Insights (the centrepiece)

**Action:**

- Click **AI Insights** in sidebar
- Hover over each of the 4 KPI tiles top-to-bottom (Portfolio Health, Risk Level, Sentiment, Opportunities)
- Click the **Risk Level** tile → cursor jumps to the Risk Watcher panel below + pulses
- Scroll down to the **Prioritised Action Items** card
- Read aloud one or two of them as examples
- Scroll to the 4 collapsible agent cards
- Click to expand one — show the detailed report

**Say:**

> "AI Insights. Four specialist agents analyse the portfolio in parallel and a senior advisor synthesises into a prioritised action plan. Health, Risk, Sentiment, Opportunities at the top. Each tile is interactive — click and you jump straight to that agent's detailed report. The action items get severity tags — Critical, High, Medium, Low, Watch — so the investor knows what to do first. This took six months of prompt engineering and is currently best-in-class for NZ retail."

---

### Shot 4 (3:00 – 3:45) — Goals + Family

**Action:**

- Click **Goals** in sidebar
- Show an On Track goal card with the progress bar + projection
- Show an Off Track goal with the catch-up suggestion
- Click **Family** in sidebar
- Show household aggregate view
- Show role badges on each member (Owner / Adult / Teen / Child)

**Say:**

> "Goals turn 'I should save more' into 'on track / off track' against a calendar date. Projection factors current value, monthly contributions, expected return. If off-track, we suggest the catch-up monthly to hit target. And because households are the unit, Family aggregates everyone's portfolios with privacy controls — adults see everyone, teens see themselves plus household read-only, children see only themselves."

---

### Shot 5 (3:45 – 4:30) — TraderIQ

**Action:**

- Click **TraderIQ** in sidebar
- Show 5 KPI tiles (Win Rate, Total P&L, Expectancy, Profit Factor, Avg Hold)
- Show the equity curve
- Show the Setup Performance breakdown
- Hover over a trade row in the journal

**Say:**

> "For active traders there's TraderIQ — sibling app, same login, different lens. Holdings are positions you still own. Trades are positions you took and exited. Win rate, expectancy, profit factor, equity curve. The AI Coach analyses your patterns — 'your Breakout setup wins 71% but you only took seven, scale this up'. No other NZ tool ships this."

---

### Shot 6 (4:30 – 6:00) — Integration round-trip (THE MONEY SHOT)

**Action:**

- Click **Admin Panel** in sidebar (visible because admin)
- Scroll to the integration buttons
- Click **"Test Dynamics 365 Sync"**
- Wait ~2 seconds for round-trip
- Scroll the output box to show Contact + Lead + PortfolioSnapshot payloads
- Click **"Test Apex Sync"**
- Wait for round-trip
- Scroll to show positions/transactions/account + the reconciliation diff
- Click **"Test Onboarding Webhook"**
- Wait for round-trip
- Scroll to show the form-field mapping output

**Say (over the clicks):**

> "Now the bit that matters for Harbour — integration stubs we've built so this can talk to your stack. Dynamics 365 first — Contact, Lead, and a custom PortfolioSnapshot entity, pushed via our proxy so Azure AD credentials never touch the browser. Production-safe — won't write to a real tenant until creds are configured.

> Apex Clearing — pulling broker-side positions, transactions, account balance. We reconcile against what InvestIQ already has and flag mismatches. Production: one nightly cron, automatic.

> Forms by Air — webhook receiver for onboarding. KYC, risk profile, T&Cs, first goal — all captured at the form level. The user signs in to InvestIQ with everything already populated.

> All three are demoable today. All three flip from preview mode to live writes the moment you give us credentials."

---

### Shot 7 (6:00 – 7:00) — Compliance posture + roadmap

**Action:**

- Open `docs/COMPLIANCE.md` in a new tab (have it ready in a tab)
- Scroll through the control register — auth, data security, app security
- Pause on the "Honest gap summary for the CEO meeting" section at the bottom
- Optionally show `docs/INTEGRATIONS.md` briefly

**Say:**

> "Compliance posture. This is our control register — cyber, NZ Privacy Act 2020, FMA stance, third-party processors, incident response. I've been honest about what we have and what's missing. Today's gaps: pen test, SOC 2 evidence collection, enforced 2FA, formal incident playbook. None are architectural. All are effort plus budget. Realistic timeline to Harbour-client-grade: four months and around $30-50k NZD.

> Roadmap: Q3 we close the compliance gaps and wire Stripe. Q4 we ship Harbour-specific features — white-label, SSO, adviser view. Q1 we launch the pilot. That's it."

---

### Shot 8 (7:00 – 7:30) — Close & ask

**Camera:** webcam full-screen (toggle Loom layout).

**Say:**

> "What we're asking for today: an LOI for partnership access to your Dynamics sandbox plus Forms by Air, so we can wire real credentials and come back in 30 days with a fully live integration demo. Lightest of three asks. If you want medium or heavy, the demo script lays those out too. Thanks for watching — I'll send the package with this video, the compliance register, and the integration doc."

**Stop recording.**

---

## Post-recording

### Loom URL
- Copy the Loom URL (public-link by default; you can password-protect if needed)
- Test the link in an incognito window — make sure it plays

### Backup
- Download the MP4 (Loom Starter feature) so you have a local copy
- Put it on your phone — instant fallback if WiFi dies

### Share
- Add to the post-meeting email (template in `DEMO_SCRIPT.md`)
- If a CEO can't attend in person, send this with a 30-min Q&A invite

---

## Re-recording triggers

Re-record the whole video if any of these happen:

- A specific agent output is misleading (re-run agents, re-record)
- The Performance chart bug returns (clean snapshots first)
- You stumble on the integration section (re-record from Shot 6)
- Audio quality is poor on playback

**Don't re-record for:** small mouse stutters, brief "uhm"s, or panel re-renders. The viewer's mind smooths over these. Authenticity > polish.

---

## Two-week-out content calendar

If you've got more time before the meeting, record these as separate Loom videos:

| Video | Length | Purpose |
|---|---|---|
| **Main demo** (this script) | 7 min | The primary asset |
| **Compliance walkthrough** | 4 min | For the CTO / Risk officer — walk through `COMPLIANCE.md` |
| **Integration deep-dive** | 5 min | For the engineering team — show the proxy code + payloads in detail |
| **Mobile experience** | 2 min | Just iPhone, no laptop. Shows the responsive story. |

Send all four as a "demo pack" before the meeting. Way more memorable than a deck.
