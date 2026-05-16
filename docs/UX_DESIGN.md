# UX & Visual Design — Principles, Research, Decisions

_Research-informed design philosophy for InvestIQ. Why each design choice is what it is. Updated as the design evolves._

Last updated: 2026-05-16

---

## Why this doc exists

Finance apps trigger anxiety. Bad UX in this category isn't "ugly, but works" — it's "user reads the wrong number, panics, sells at the bottom". Design isn't decoration; it's risk mitigation.

This doc captures what we've adopted from research + competitive analysis, so design decisions aren't whimsical. If a future change conflicts with a principle here, the principle wins or the principle gets updated — explicitly, not silently.

---

## 1. The psychological context of investment apps

### What the literature says

**Loss aversion** (Kahneman & Tversky, 1979): people feel losses ~2× as strongly as equivalent gains. A 5% loss reads as "catastrophe"; a 5% gain reads as "fine". *Design implication:* don't lead with red. Don't make losses bigger / louder than gains. Use neutral cards for context, accents only for the actual gain/loss number.

**Hyperbolic discounting**: users prioritise short-term feedback over long-term outcomes. *Design implication:* surface meaningful long-term context alongside today's number. "+NZ$285 today, up 27% all-time" works better than just "+NZ$285 today" alone.

**Anchoring effect**: the first number a user sees shapes how they evaluate every other number. *Design implication:* the first number on Overview should be **portfolio value**, not return %. Return % framed against a benchmark gives meaning, not isolation.

**Endowment effect**: people value things they own more. *Design implication:* greet by name, use possessive copy ("Your portfolio"), show ownership clearly.

**Choice overload** (Iyengar & Lepper, 2000): too many options leads to inaction. *Design implication:* hide non-essential controls, surface them progressively. Don't dump 7 chart toggles on Overview.

**Cognitive load / Miller's 7±2**: working memory holds ~5-9 items. *Design implication:* group info into chunks of ≤7. Our 4 metric cards (Value / Return / Day / Diversification) work; 12 would not.

### What investment apps specifically do

**Wealthsimple** (Canada, ~3M users): generous whitespace, calm pastels, narrative copy ("You've earned $X this year"). Backgrounds avoid pure white. Greens are deep emerald, not bright lime. No red unless real loss.

**Robinhood (early, pre-redesign)**: bold green for gains, candle charts, swipeable details. Criticised post-GameStop for gamification — confetti animations on trades created dopamine loops that academic finance research linked to over-trading. We learn from this: **no celebratory animations on price moves**. Variable rewards yes, casino feel no.

**Sharesight** (NZ/AU, ~30k users): dense data tables, professional feel, no flair. Optimises for accountants and serious investors. Trades engagement for trust signals. Our positioning is between these — friendly but not toy-like.

**Hatch NZ**: clean cards, single-broker focused, minimal AI. Plain. Trust comes from "we partner with NZ banks" copy. Their first-time signup is excellent — gentle, no jargon.

**Empower (Personal Capital, US)**: dashboard-first, sankey diagrams for cash flow, polished. Their "Investment Checkup" tool is exactly what AI agents do better.

### Investment-app design principles we've adopted

| Principle | What it means | How we apply it |
|---|---|---|
| **Calm > exciting** | Anxiety reduces decision quality. No confetti, no aggressive reds. | Soft greens/reds for change. Neutral cards. No animations on price moves. |
| **Story before stats** | The brain processes narrative faster than raw numbers. | Greeting headline reads "Your portfolio is +NZ$285 today" before any chart. |
| **Glanceability** | Top-line answer in under 1 second. | 4-card row at top of Overview = total value + return + today + diversification. |
| **Progressive disclosure** | Show the summary, drill into details on demand. | Top 5 holdings on Overview, "View all" CTA to the full Holdings tab. |
| **Loss-aversion-aware** | Don't amplify the negative. | Neutral baseline, accents only on the actual gain/loss numbers. |
| **Trust signals visible** | NZ users are risk-averse re. financial apps. | "Your data is encrypted in your own Supabase project" in sign-in copy. RLS isolation. Snapshot history audit trail. |
| **Variable rewards (gentle)** | Fresh content gives reason to return. | Daily Brief AI changes daily. "Today's biggest moves" card different each session. |
| **Recognition over recall** | Don't make users remember; show. | Holdings table shows symbol + name + colored type chip. Asset colors consistent across charts. |

---

## 2. Visual hierarchy

### F-pattern reading

Eyes scan top-left → across → down. We design for this.

```
┌──────────────────────────────────────┐
│ 1. GREETING (story headline)         │ ← Most important text, biggest font
├──────────────────────────────────────┤
│ 2. SUMMARY CARDS (4 metrics)         │ ← Glanceable numbers
├──────────────────────────────────────┤
│ 3. CHARTS (allocation + perf)        │ ← Context for the numbers
├──────────────────────────────────────┤
│ 4. TODAY'S MOVES (fresh content)     │ ← Variable reward
├──────────────────────────────────────┤
│ 5. TOP HOLDINGS preview              │ ← Drill-in candidates
├──────────────────────────────────────┤
│ 6. RISK + INSIGHTS                   │ ← Deeper context
└──────────────────────────────────────┘
```

Each section's importance descends as the user scrolls.

### Size + weight hierarchy

| Element | Font | Size | Weight |
|---|---|---|---|
| Greeting headline | Inter | 24px | 700 |
| Section titles | Inter | 14px | 600 |
| Metric values (big numbers) | JetBrains Mono | 24px | 700 |
| Body text | Inter | 14px | 400 |
| Captions / hints | Inter | 11-12px | 400 |
| Labels | Inter | 12px (uppercase, letter-spacing) | 600 |

Monospace ONLY for numbers (so "NZ$ 1,234.56" aligns column-wise in tables).

### Spacing

We use an 8px baseline. All margins / padding should be multiples of 4 (preferred) or 8.

| Use | Size |
|---|---|
| Tight inline (chip padding) | 4-6px |
| Card internal padding | 14-20px |
| Section vertical gap | 24px (mb-6 Tailwind) |
| Modal padding | 24-32px |

Don't use 7px, 9px, 13px etc. — they look "off-grid" subliminally.

---

## 3. Color palette

### Dark mode (default)

| Token | Hex | Used for |
|---|---|---|
| `--bg` | `#080d1a` | Body background — deep navy, not pure black |
| `--bg-panel` | `#0f1729` | Card backgrounds |
| `--bg-panel-2` | `#141e33` | Inset cards (card2 within card) |
| `--bg-input` | `#141e33` | Form fields |
| `--border` | `#1e2d4a` | Default card / divider |
| `--border-strong` | `#2a3f60` | Hover / active borders |
| `--text-primary` | `#c8d6ef` | Primary text — soft white, not pure |
| `--text-secondary` | `#94a3b8` | Secondary text |
| `--text-muted` | `#4a6080` | Hints, captions |
| `--accent` (indigo) | `#6366f1` | Primary CTA, accent |
| `--accent-amber` | `#fbbf24` | Highlights, warnings, dividends |
| `--accent-green` | `#34d399` | Gains, positive movement |
| `--accent-red` | `#f87171` | Losses, negative movement |
| `--accent-teal` | `#22d3ee` | NZ funds, KiwiSaver, family |
| `--accent-violet` | `#a78bfa` | KiwiSaver-specific, premium |

### Light mode (v0.8c — refined per research)

WCAG AAA contrast against the relevant background. Slightly more saturated accents than dark mode because light backgrounds wash colors out.

| Token | Hex | Notes |
|---|---|---|
| `--bg` | `#f8fafc` | Slate-50, NOT pure white (eye strain) |
| `--bg-panel` | `#ffffff` | Pure white only for cards |
| `--bg-panel-2` | `#f1f5f9` | Slate-100, subtle inset |
| `--bg-input` | `#ffffff` | Form fields pop on slate-50 bg |
| `--border` | `#e2e8f0` | Slate-200, subtle |
| `--border-strong` | `#cbd5e1` | Slate-300, hover/focus |
| `--text-primary` | `#0f172a` | Slate-900, NOT pure black |
| `--text-secondary` | `#475569` | Slate-600 |
| `--text-muted` | `#94a3b8` | Slate-400 |
| `--accent` (indigo) | `#4f46e5` | Indigo-600, more saturated |
| `--accent-amber` | `#d97706` | Amber-600 — readable on white |
| `--accent-green` | `#059669` | Emerald-600 |
| `--accent-red` | `#dc2626` | Red-600 |
| `--accent-teal` | `#0891b2` | Cyan-600 |
| `--accent-violet` | `#7c3aed` | Violet-600 |

### Why no pure black / pure white

Pure `#ffffff` background + pure `#000000` text creates a glare effect — high contrast feels harsh, leads to eye fatigue in long sessions. **Slate-50 + slate-900 reduces glare ~30%** while still hitting WCAG AAA.

### Why we keep indigo across both modes

InvestIQ's brand color is indigo. Brand recognition trumps theming. We tune saturation (lighter in dark, darker in light) so contrast works, but the hue stays.

### Asset type colors

Same in both modes — these are functional, not decorative:

| Type | Color | Why |
|---|---|---|
| Stock | `#818cf8` indigo | Brand alignment |
| ETF | `#60a5fa` blue | "Bigger basket" feel |
| Crypto | `#fbbf24` amber | Conventional crypto color |
| Bond | `#34d399` green | Stable, conservative |
| Cash | `#94a3b8` slate | Neutral |
| Fund (NZ managed) | `#22d3ee` teal | Distinct from crypto/stock |
| KiwiSaver | `#a78bfa` violet | Premium / retirement feel |
| Real estate | `#fb923c` orange | Conventional property color |
| Mutual fund | `#c4b5fd` violet-light | Like fund but secondary |
| Other | `#64748b` slate | Generic |

---

## 4. Components

### Cards

Default `.card`:
- Background: `var(--bg-panel)`
- Border: `1px solid var(--border)`
- Border radius: `12px`
- Padding: `20px` (or `14-18px` for compact)
- Transition: `0.25s` on `background`, `border-color` for theme switch smoothness

Nested cards (`.card2`):
- Background: `var(--bg-panel-2)`
- Border: `1px solid var(--border)`
- Border radius: `8px` (smaller — visual nesting)

### Buttons

| Variant | Use |
|---|---|
| `.btn-primary` | The single most important action per screen |
| `.btn-secondary` | Common actions; outline-ish |
| `.btn-danger` | Destructive (Delete, Revoke); muted red, never bright |
| `.btn-success` | Rare — Approve, Complete |
| `.btn-sm` | Inside tables / cards |

**Avoid stacking buttons of equal weight.** One primary, others secondary. Hick's Law.

### Inputs

- Always have a `label` element (even if visually hidden — screen reader)
- Hint text below the input, not above
- Error state: red border + red hint text
- Focus state: indigo border, no outline ring (we control it)
- Number inputs: `step="any"` and `inputmode="decimal"` for mobile keypad

### Tags / chips

Always use the `.tag tag-{type}` pattern. Background is 12-15% opacity of the foreground color so it never overwhelms.

### Toasts (notifications)

- Slide in from bottom-right (desktop) / bottom-center (mobile)
- Auto-dismiss after 4s (success), 6s (error), 4s (warning)
- Stack vertically, newest at bottom
- Click × to dismiss early
- Don't use for confirmation prompts — use `showConfirm()` modal

### Modals

Two flavors:
- **Data-entry modals** (Add Holding, Settings, Add Dividend, etc.) — sticky backdrop, only X / Cancel / Esc dismiss. Loss prevention.
- **Read-only modals** (Holding Detail) — backdrop click dismisses fine.

The `STICKY_MODALS` set in JS enforces this.

### Charts

Chart.js with:
- No animation on data update (jarring during refresh)
- Grid lines: `rgba(30,45,74,0.4)` dark / `rgba(203,213,225,0.4)` light
- Tick labels: `var(--text-muted)`
- Tooltips: dark themed background, padding 10px, border 1px

Asset/category colors are consistent across:
- Allocation chart slices
- Holdings type chips
- Per-member family colors (where applicable)

---

## 5. Empty states

A new user opening Overview without holdings shouldn't see a blank dashboard. Each section has an empty state:

| Section | Empty-state content |
|---|---|
| Overview holdings | "Add your first holding to begin" + CTA button |
| Holdings tab | Same + CSV import option |
| Performance | "Your chart grows here — daily snapshot saved automatically when you open the app" |
| AI Insights | "Run agents to see analysis" |
| Watchlist | "Track tickers you're researching but don't own yet" |
| Dividends | "Record dividends as they land — IR3-ready export at tax time" |
| Family | "You're not in a family yet. Create one to invite spouse / kids / accountant" |
| Alerts | "Get emailed when NVDA drops below your number" |

Empty states are opportunities — they teach the user what the section is FOR.

---

## 6. Micro-interactions

Subtle enhancements that signal responsiveness without being distracting:

- **Card hover** (clickable cards only): translateY(-2px) over 0.15s + border color shift to brand accent
- **Button hover**: -1px translate + background darken
- **Theme toggle**: 0.25s background+color transition for smooth swap
- **Toast appearance**: slide in + fade in from bottom-right, 0.25s
- **Modal open**: fade in overlay, scale up modal 0.95 → 1, 0.2s
- **Skeleton loaders**: on first paint, before real data

Avoid:
- Big animations on number changes (price ticks) — feels like a slot machine
- Confetti / celebration animations on milestones — anti-Robinhood lesson
- Sound effects on actions — phone-rage potential
- Persistent badges blinking — annoyance

---

## 7. Accessibility (currently fair, not great)

What's already correct:
- Inputs have visible focus rings
- Tap targets ≥40px on mobile
- 16px font-size on inputs (prevents iOS auto-zoom)
- Color contrast WCAG AA for body text

What needs work (tracked in SECURITY.md / TODO.md):
- ARIA labels on icon-only buttons
- Screen reader support
- Keyboard navigation through modals
- Reduced-motion media query for users who disable animations

---

## 8. Mobile-specific decisions

Sticky portfolio summary (top), bottom tab bar (nav), card-flow for tables, 40px tap targets, no-zoom 16px inputs, toast above mobile nav. See `index.html` `@media (max-width: 768px)` block.

Phone is the primary "morning glance" device. Desktop is the "tax-time deep dive" device. UX should reflect both modes.

---

## 9. Future research / decisions still open

| Question | Status |
|---|---|
| **Should we add achievement badges** (e.g. "30-day streak")? | Pending — risk of gamification per Robinhood lessons |
| **Should we surface our AI agents' confidence scores**? | Open — research split on whether confidence helps or hurts decisions |
| **Should we add a "panic mode" with calming copy** for big down days? | Speculative |
| **Custom domain (investiq.co.nz vs InvestIQ App rebrand)** | Pending Claude Design exploration + IPONZ search |
| **Native mobile app vs PWA** | Deferred — PWA likely sufficient for v1 |
| **Onboarding wizard length** | Currently 4 steps; research suggests 2-3 ideal |

---

## How this doc gets updated

- Every meaningful UI/UX change references back to which principle drove it
- New research findings → add to section 1
- New competitive analysis → update section 1
- Empty state for new section → add to section 5
- Always: incrementally, in the same commit as the change.
