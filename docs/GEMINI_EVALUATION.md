# Google Gemini — Provider Evaluation & Plan

_Research date: 2026-06-06. Prices USD per 1M tokens, standard (non-batch) tier. No code committed — this is a decision doc per the "new paid service needs explicit OK" rule._

---

## TL;DR recommendation

Add Gemini as an **optional second provider, not a wholesale replacement.** The codebase is already ~80% provider-abstracted (proxy routes by URL path; `callClaude` already has a provider switch), so supporting two providers is low-cost.

**Recommended rollout:**
1. Build the two-provider abstraction behind the existing proxy interface.
2. **A/B the fan-out**: shadow the 4 Haiku agents with **Gemini 3.1 Flash-Lite** ($0.25/$1.50) behind a format-validation gate + Claude fallback.
3. Keep **Opus 4.8** on the Senior Advisor synthesis initially; only move synthesis to **Gemini 2.5 Pro** ($1.25/$10) after the fan-out proves format reliability in production.

**Why not full swap:** Claude Haiku has the strongest structured-output/instruction-following track record, and our format contracts (`[Critical/High/Medium/Low/Watch]` tags) depend on adherence more than raw benchmark IQ. Gemini's win is **cost** (~60–90% cheaper on the fan-out) and a **1M context window**. At our volume the absolute dollars are small — so this is about **resilience + optionality**, not cost survival.

---

## 1. Current Gemini lineup & pricing (paid API, Jun 2026)

3.x is the frontier line; 2.5 remains GA and cheaper at the bottom. (Gemini 2.0 Flash/Flash-Lite were retired 1 Jun 2026.)

| Model | Model ID | In /1M | Out /1M | Context | Notes |
|---|---|---|---|---|---|
| Gemini 3.5 Flash | `gemini-3.5-flash` | $1.50 | $9.00 | 1M | Top fast-tier reasoning |
| Gemini 3.1 Pro (Preview) | `gemini-3.1-pro-preview` | $2.00/$4.00 | $12/$18 | ~1M | Frontier, still "preview" |
| Gemini 3.1 Flash-Lite | `gemini-3.1-flash-lite` | $0.25 | $1.50 | 1M | Flat pricing; **fan-out pick** |
| Gemini 3 Flash (Preview) | `gemini-3-flash-preview` | $0.50 | $3.00 | 1M | |
| Gemini 2.5 Pro | `gemini-2.5-pro` | $1.25/$2.50 | $10/$15 | 1M | GA, strong; **synthesis pick** |
| Gemini 2.5 Flash | `gemini-2.5-flash` | $0.30 | $2.50 | 1M | |
| Gemini 2.5 Flash-Lite | `gemini-2.5-flash-lite` | $0.10 | $0.40 | 1M | Cheapest viable text tier |

- Batch API = 50% off (async; could suit the weekly-digest cron, not live fan-out).
- Pin exact IDs (e.g. `gemini-2.5-pro`, not `-latest`); avoid "preview" models for user-facing features.

Sources: ai.google.dev/gemini-api/docs/pricing (fetched 6 Jun 2026); costgoat.com/pricing/gemini-api; tokenmix.ai Gemini 3.1 pricing; devtk.ai Gemini 3.1 Flash-Lite.

## 2. Head-to-head vs Claude

Current Claude (Jun 2026): Haiku 4.5 = $1.00/$5.00, Opus 4.8 = $5.00/$25.00, Sonnet 4.6 = $3.00/$15.00.

| Dimension | Haiku 4.5 | Gemini 3.1 Flash-Lite | Opus 4.8 | Gemini 2.5 Pro |
|---|---|---|---|---|
| Cost in/out | $1.00/$5.00 | $0.25/$1.50 | $5.00/$25.00 | $1.25/$10.00 |
| Reasoning (fin.) | Solid | Comparable/ahead per-$ | Best-in-class | Strong, just below Opus |
| **Structured-output adherence** | **Strongest** | Good, more variance | Excellent | Good (native JSON mode) |
| Latency | ~1–2s | Fast | ~8–15s | Faster than Opus |
| Context | 200K | **1M** | 200K | **1M** |

Qualitative: for code that parses output by tags, **adherence > benchmark IQ** → Claude Haiku is the safer default on the fan-out.

### Privacy / NZ Privacy Act 2020
- **Paid Gemini API / Vertex AI do NOT train on prompts/responses** (the free tier DOES — never use free tier for real portfolios).
- True region pinning / zero-retention is a **Vertex AI enterprise contract** feature, not the plain Developer API key you'd put on Render.
- **Net:** functionally equivalent to our current Anthropic posture (no training, US/global processing, no NZ/AU residency on a simple key). Adding Google = **one more named sub-processor to disclose** in the privacy policy, not a new risk category.

## 3. Fit in the 5-agent pipeline

Current (`standalone/js/70-ai.js`, `AGENT_DEFS`): 4 Haiku fan-out (`portfolio`, `market`, `risk`, `opportunity`) + 1 Opus synthesis (`advisor`). **Note: advisor is pinned to `claude-opus-4-5` — stale; current is `claude-opus-4-8` (same price, better). Worth bumping.**

- **Fan-out** → Gemini 3.1 Flash-Lite (balanced) or 2.5 Flash-Lite (rock-bottom).
- **Synthesis** → Gemini 2.5 Pro (GA) — not 3.1 Pro preview.

### Cost per full 5-agent run (rough; ~2.5K in/0.8K out per fan-out agent, ~5K in/1K out advisor)

| Setup | Total/run | vs now |
|---|---|---|
| Current Claude (Haiku×4 + Opus 4.8) | ~$0.076 | — |
| Gemini cheap (2.5 Flash-Lite×4 + 2.5 Pro) | ~$0.019 | ~75% cheaper |
| Gemini balanced (3.1 Flash-Lite×4 + 2.5 Pro) | ~$0.024 | ~68% cheaper |
| **Mixed (recommended): Gemini fan-out + Opus 4.8** | ~$0.057 | ~25% cheaper, keeps synthesis quality |

## 4. Multi-provider architecture (Python proxy)

Already most of the way there: proxy routes by URL path (`/v1/messages` → `_proxy_anthropic`); `callClaude` already has a provider switch.

1. **AGENT_DEFS**: add `provider: 'anthropic'|'google'` + `modelGoogle` per agent; default `provider:'anthropic'` so nothing changes until flipped.
2. **Proxy**: add `POST /v1/gemini` → `_proxy_google(body)` mirroring `_proxy_anthropic`; reads `GOOGLE_AI_API_KEY` from env; forwards to `generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`.
3. **Shape translation in the proxy** (keeps frontend provider-agnostic): Anthropic `{system, messages, max_tokens}` ↔ Gemini `{systemInstruction, contents:[{role,parts:[{text}]}], generationConfig:{maxOutputTokens}}`; map `assistant`→`model`; unwrap `candidates[0].content.parts[0].text`.
4. **Key handling**: `GOOGLE_AI_API_KEY` as a Render env var, server-side only (same pattern as `ANTHROPIC_API_KEY`).
5. **Fallback**: on 429/5xx/timeout, retry once on the other provider via a per-agent `fallback:{provider,model}`. Fan-out agents are independent, so one failover doesn't block the others. Log which provider served each agent.
6. **Diagnostic (Rule #2)**: an Admin "Test Gemini" button firing one Flash-Lite call through `/v1/gemini`, showing the raw response + which provider answered.

## 5. Risks & gotchas

- **Format-contract drift (highest).** Gemini more prone to preamble / dropping the severity tags. Mitigate: native JSON-schema mode, "output ONLY the tagged lines" instruction, and a parser-validation gate that fails over to Claude if the contract isn't met. Test on real portfolio data before trusting it on paywalled Pro reports.
- **Prompt migration.** Prompts don't transfer 1:1 — budget time to re-tune + re-validate each of the 5 agent prompts. Keep Claude prompts as canonical.
- **Vendor lock-in — actually reduced** by a two-provider abstraction (matches the "swap provider in a sprint" pitch). Risk is config sprawl: pin exact model IDs, avoid preview models.
- **Rate limits.** Non-issue at single-user scale; cross-provider fallback adds headroom.
- **Data residency gap.** Don't over-promise residency; "not used for training, processed by named US/global sub-processors" is the accurate framing for both providers.

---

## Decision needed before any build
1. Approve building the two-provider abstraction (no spend yet — code only)?
2. If yes, you'll need to create a **Google AI Studio API key** and add `GOOGLE_AI_API_KEY` to Render (you run it; I never handle the key).
3. Separately: OK to bump `advisor` from `claude-opus-4-5` → `claude-opus-4-8` (same price, better quality)?

_Files for implementation when greenlit: `claude_proxy.py` (add `_proxy_google` + `/v1/gemini`), `standalone/js/70-ai.js` (`AGENT_DEFS`, `callClaude`), `docs/MODEL_SELECTION.md`, `docs/LLM_HANDOFF.md`._
