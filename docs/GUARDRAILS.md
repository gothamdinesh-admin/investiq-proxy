# Guardrails — InvestIQ Outputs & Data

_Every AI output and every piece of data handling in InvestIQ must follow these rules._

---

## 1. Regulatory wording (NZ FMA)

The user is in New Zealand. Under the Financial Markets Conduct Act, providing personalised
"financial advice" requires a licence. InvestIQ is an **informational tool**, not an adviser.

### Vocabulary — hard rules
| ✅ Use | ❌ Never use |
|---|---|
| "analysis" | "advice" |
| "observation" | "recommendation" |
| "consideration" | "you should buy/sell" |
| "data suggests" | "I recommend" |
| "one option to consider" | "the right move is" |
| "factors worth watching" | "guaranteed to…" |

### Every AI output MUST include
- A soft disclaimer at the end of advisor output: _"This is analysis only, not personalised financial advice. Consult a licensed adviser for decisions."_ (advisor agent only — others stay concise).

### System prompts must explicitly forbid
- Predicting future prices
- Making personal investment recommendations
- Suggesting specific timing ("buy this week")
- Guarantees of any kind

Current agent system prompts in `AGENT_DEFS` comply — do not rewrite them without keeping this in mind.

---

## 2. Output format contracts

Each agent has a required format. Breaking the format breaks UI parsing.

| Agent | Required start | Word limit | Structure |
|---|---|---|---|
| Portfolio Health | `Health Score: X/100` (regex `/Health Score:\s*(\d+)/i`) | ≤220 | Score, then 3-4 bullets |
| Market Impact | No header | ≤220 | 3 factors × impacted holdings, then sentiment |
| Opportunity Scout | No header | ≤220 | 2-3 gaps with named real tickers |
| Senior Advisor | No header | ≤300 | Top 5 actions, 1 risk, 1 positive, 30-day focus |

If the score regex fails to match Health Score output, `updateScoreRing()` silently no-ops — the ring stays on the last known value. Enforce "Health Score: X/100" strictly.

---

## 3. Data classification

### 🔴 Never leaves the browser
- `state.settings.claudeApiKey`  — stripped from all Supabase writes + backups
- `state.settings.supabaseKey`    — stripped from backups
- Any password
- Akahu tokens (they stay in localStorage only)

Enforced in:
- `saveToSupabase()` — deletes `claudeApiKey` before upsert
- `exportBackup()` — sets both keys to `''`

### 🟡 Syncs to Supabase (per-user RLS)
- `portfolio` (holdings with lots, tickers, quantities, prices, notes)
- `settings` minus keys
- `agent_results` (last AI analysis)
- Profile: email, last_seen, is_admin

### 🟢 Sent to Anthropic API
- Portfolio ticker + quantity + avg price + currency + sector + country
- Current market data (indices, FX, commodities)
- User's optional `marketContext` note

### 🔵 Sent to Yahoo Finance
- Tickers only. Nothing else.

---

## 4. Proxy layer rules

`claude_proxy.py` on Render is the only service that talks to Anthropic.

- Forwards the user's `x-api-key` header unchanged — proxy never stores it
- No request logging of bodies (only status codes)
- CORS open (`*`) because the app runs on a Netlify domain that can change
- Rate limiting: none currently. **Must add before commercialising** (e.g. per-IP token bucket).

If deploying as multi-tenant SaaS, the proxy must:
1. Authenticate Supabase JWT on every request
2. Lookup user's API key in Supabase secrets (or hold a platform key)
3. Log only user_id + endpoint + status (never ticker lists — that's MNPI-adjacent)

---

## 5. Admin capabilities — what the master account can and can't do

The admin panel (visible to `is_admin=true` profiles) enables:
- [x] See every user's email, join date, last seen, holding count
- [x] Grant/revoke admin to other users
- [x] Delete a user's portfolio row (but NOT their auth account — must be done in Supabase UI)

Admin explicitly **cannot**:
- See holdings detail for other users (by default — portfolio RLS allows admins to SELECT but the UI doesn't render it; don't surface that view lightly)
- See or reset passwords (Supabase Auth handles that)
- Export all users' portfolios to a single file (privacy risk — add a 2FA gate before implementing)

If the user asks to build "let admin see a specific client's portfolio" — confirm with them that the client has consented.

---

## 6. Prompt injection defence in agent inputs

The advisor agent receives the outputs of the other 3 agents. An injection attack could come from:
- `state.settings.name` (portfolio name) — user-controlled, low risk
- `state.portfolio[].notes` — user-controlled
- `state.portfolio[].name` (e.g. full company name from CSV) — user-controlled
- `marketContext` field — user-controlled

Mitigation:
- Never let Claude outputs become executable code on the frontend — we `formatMarkdown()` them to HTML, which escapes `<script>` but allows basic tags. `innerHTML` use in `insightsContent` could be tightened if the app goes public.
- Strip HTML tags from portfolio note fields on import.

---

## 7. Error handling philosophy

| Failure | User-facing message | Dev behaviour |
|---|---|---|
| Proxy down | "Cannot reach Claude API. Check proxy URL + API key." | Status dot goes red, keep-alive retries every 14 min |
| Invalid API key (401) | Surface Anthropic's error verbatim | Do not retry |
| Supabase save fails | Silent (local save still worked) | `console.warn`, retry on next state change |
| yfinance returns empty | Silently fall back to cached/avg price | `console.warn` |
| RLS policy blocks a read | "Session expired — please sign in again" | Force re-auth |

Never expose raw stack traces to the user. Never log API keys.

---

## 8. Testing checklist before deploying a change

- [ ] Can a new user sign up, see an empty dashboard, and add a holding?
- [ ] Does the existing user's cloud-synced portfolio still load unchanged?
- [ ] Do agent outputs still match their format contract (esp. Health Score regex)?
- [ ] Is the admin link hidden for non-admin users?
- [ ] Are API keys stripped from any cross-device data (backup JSON, Supabase)?
- [ ] Does the proxy `/health` endpoint respond within 8s?

---

## 9. When a user asks for something that violates these rules

If asked to:
- "Just recommend a stock to buy" → reframe as "here's an analysis of what's underweight"
- "Share my portfolio with another user" → require explicit sharing UI, never auto-share
- "Remove the disclaimer" → refuse politely, explain FMA risk
- "Store my eToro password" → refuse absolutely
- "Auto-execute trades" → out of scope; InvestIQ is analysis-only

These aren't nice-to-haves — they're the line between a personal tool and a legal problem.
