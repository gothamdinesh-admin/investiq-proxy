# Model Selection Guide — InvestIQ

_Which Claude model to use for which job, and why._

---

## 1. The three tiers

| Tier | Model | Speed | Cost (rel.) | When to reach for it |
|---|---|---|---|---|
| **Fast** | `claude-haiku-4-5` | ~1-2s | 1× | Structured data crunching, classification, formatting, extraction, validation |
| **Balanced** | `claude-sonnet-4-5` | ~3-6s | ~5× | Market analysis, reasoning with domain knowledge, balanced creativity |
| **Premium** | `claude-opus-4-5` | ~8-15s | ~25× | Strategic synthesis, multi-source reasoning, final recommendations |

Always start with the cheapest tier that can do the job. Move up only when quality demonstrably matters.

---

## 2. Default InvestIQ agent → model mapping

Already implemented in `AGENT_DEFS` (standalone/index.html):

| Agent | Model | Why this tier |
|---|---|---|
| 📊 Portfolio Health | **Haiku** | Input is structured JSON; output is a score + 3-4 bullets. No market knowledge needed beyond the data itself. |
| 🌍 Market Impact | **Sonnet** | Requires real-world market context (macro factors, sector trends). Haiku would hallucinate; Opus is overkill. |
| 🔭 Opportunity Scout | **Sonnet** | Creative gap analysis with named tickers. Needs reasoning to balance risk + diversification but not full synthesis. |
| 💼 Senior Advisor (orchestrator) | **Opus** | Synthesises all 3 prior outputs + portfolio data into a prioritised action plan. This is the highest-value output; spend the tokens. |

**Execution pattern:** first 3 agents run in parallel via `Promise.all()`. The advisor runs after, consuming their outputs as context. Total wall time ≈ time of slowest Sonnet call + Opus call ≈ 10-20s.

---

## 3. Decision framework for NEW agents or features

Ask these in order:

### Is the task pure data transformation?
- Classifying "is this a stock or ETF?"
- Extracting numbers from free text
- Formatting a summary from structured input
- CSV parsing hints

→ **Haiku**. Cap `max_tokens` at 500-800.

### Does the task need domain knowledge or nuanced reasoning?
- "Which sectors are cyclical vs defensive right now?"
- "What's the correlation between these holdings?"
- "Draft a commentary on this earnings release"

→ **Sonnet**. Cap `max_tokens` at 800-1200.

### Is the task synthesising multiple expert outputs, or the user-facing final word?
- "Combine these 3 reports into one action plan"
- "Write the investor's monthly letter"
- "Explain why these three recommendations together make sense"

→ **Opus**. Cap `max_tokens` at 1200-2000. Rarely above 2000.

### Is latency critical (<2s user-perceived)?
→ **Haiku only**, regardless of task. Prompt harder to compensate.

---

## 4. Cost-aware patterns

### Fan-out / fan-in (already used in InvestIQ)
Run N cheap agents in parallel, feed outputs to 1 premium synthesiser.
- 3× Sonnet + 1× Opus ≈ 40 units
- vs 4× Opus ≈ 100 units
- Quality is usually indistinguishable because Opus makes the final call either way.

### Haiku as a gatekeeper
Before invoking Sonnet/Opus, ask Haiku: "Is this input good enough / does it need clarification?"
Saves 80% of failed premium calls.

### Cache the expensive one
Opus outputs for the advisor agent are cached in `state.agentResults` + Supabase.
Don't re-run agents unless portfolio or market data has changed meaningfully.

---

## 5. When NOT to use Claude at all

| Task | Use instead |
|---|---|
| FX conversion | `getFxRate()` — Yahoo Finance live rates |
| Cost basis / return calc | `getMetrics()` — pure JS math |
| Ticker resolution | Yahoo Finance symbol lookup |
| CSV parsing | `parseCSVLine()` — regex in JS |
| Portfolio score (deterministic) | `calcDiversificationScore()` — pure JS heuristic |

AI is for **judgment and language**, not maths. Never ask Claude to compute a number you can compute yourself.

---

## 6. Model version policy

- Always pin exact model IDs (`claude-sonnet-4-5`, not `claude-sonnet-latest`).
- When Anthropic releases a new version, update the pins in `AGENT_DEFS` after testing on the user's real portfolio.
- Keep `max_tokens` fixed per agent — cost regressions are the biggest risk when upgrading.

---

## 7. Quick reference snippet

```js
// In AGENT_DEFS — current production mapping
portfolio:   { model: 'claude-haiku-4-5',  maxTokens:  800 }   // fast scorer
market:      { model: 'claude-sonnet-4-5', maxTokens:  800 }   // macro reasoning
opportunity: { model: 'claude-sonnet-4-5', maxTokens:  800 }   // gap analysis
advisor:     { model: 'claude-opus-4-5',   maxTokens: 1200 }   // synthesis
```
