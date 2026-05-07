# Self-Check — Mandatory Before Every Commit

_This doc is a hard requirement. Treat it as the regression test harness for a project that has no automated tests._

When the user asks for a change, Claude MUST work through this checklist before saying "done" or pushing. If any check fails, fix the regression before committing.

---

## 🔍 1. Impact Audit — "what did I actually touch?"

Before editing any function, grep the codebase for **every caller and every reference**:

```bash
# From the project root:
grep -n "functionName\|fieldName\|dom_id\|cssClass" standalone/index.html
```

Ask: for each match, **does my change still work there?** If unsure, read the surrounding 10 lines.

This is non-negotiable for:
- Renaming/deleting any function, variable, field, DOM id, or CSS class
- Changing a function's arguments or return shape
- Changing the structure of `state.portfolio[]`, `state.settings`, or `state.agentResults`

## 🔍 2. Orphan check — "did I leave dead references?"

After editing, search for any reference to things I removed:

```bash
grep -n "oldFunctionName\|oldDomId\|oldClass" standalone/index.html
```

Zero matches = clean. Any match = orphan → fix or delete.

Common orphans to look for after UI changes:
- Removed DOM elements: still being `document.getElementById('...')` somewhere
- Removed CSS classes: still being referenced in `className=`
- Renamed functions: still being called from inline `onclick=`

## 🔍 3. Data model regression check

Before touching `state.portfolio`, `state.settings`, or any field on a holding:

- Check `loadState()` — does it correctly migrate old data to new shape?
- Check `saveState()` and `saveToSupabase()` — do they persist the right fields?
- Check `loadFromSupabase()` — does it merge cloud data without wiping local credentials?
- Check `getMetrics()` + `getHoldingBasis()` — do computed metrics still derive correctly?
- Check **every function that reads** the field — `grep -n "h\.purchasePrice\|h\.quantity\|h\.lots" standalone/index.html`

## 🔍 4. Currency / FX path review

Any change that touches prices or values must answer:
- Is this value in the **holding's native currency** or the **user's base currency**?
- Did I apply `getFxRate(h.currency, base)` exactly once (not zero times, not twice)?
- Is `h.currentPrice` the FX-converted one (from `getMetrics`) or the raw one (from `state.portfolio`)?

**Rule of thumb:** anything in `metrics.holdings[]` is already FX-converted. Anything in `state.portfolio[]` is NOT.

## 🔍 5. Local-only credentials check

Any change to settings merging/saving must preserve these fields locally and never leak them to cloud:
```
LOCAL_ONLY_SETTINGS = [claudeApiKey, supabaseUrl, supabaseKey, akahuAppToken, akahuUserToken]
```

If I add a new credential-like field, **add it to this array**.

## 🔍 6. Agent output contract check

If I touch `AGENT_DEFS` or any agent prompt, confirm:
- Portfolio Health still starts with `Health Score: X/100` (regex `/Health Score:\s*(\d+)/i`)
- Word-limits on each agent still match what's in `docs/GUARDRAILS.md`
- Model IDs are still valid (`claude-haiku-4-5`, `claude-sonnet-4-5`, `claude-opus-4-5`)
- `max_tokens` caps unchanged unless deliberately updated

## 🔍 7. UI regressions — render every section

After a UI change, mentally walk through each section and verify it still renders:
- Overview (score ring, top cards, quick insights)
- Holdings (table with all 7 columns: Units / Avg Cost / Invested / Current / Mkt Value / P&L)
- Performance (snapshot chart + type + platform + top/bottom)
- Market (indices + crypto + FX + commodities)
- AI Insights (4 agent cards, run button)
- Admin (if user is admin)

## 🔍 7b. Grid table layout (every new table)

When adding or modifying any grid-based table (`.table-row` / `.table-header` with `grid-template-columns`):

- [ ] `display:grid` set **inline** on header AND row (not relying on CSS class alone)
- [ ] Asset / multi-content cell has `min-width:0;overflow:hidden;` on the wrapper
- [ ] Text inside that cell has `white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`
- [ ] Long-text fields (name, country, notes) have `title="${esc(value)}"` for the tooltip on hover
- [ ] Icons inside flex containers in the asset cell have `flex-shrink:0`
- [ ] All user-supplied data passed through the `esc()` helper

The canonical example lives above `renderDetailedHoldings()` in standalone/index.html — copy that pattern. Skipping any of these on a narrow viewport or with a long instrument name (e.g. "Vanguard Total Stock Market Index Fund Admiral Shares") breaks the column alignment.

## 🔍 8. Auth gate / multi-user isolation

If I touch auth, Supabase, or RLS:
- A brand-new user signing up gets an empty dashboard, not someone else's data
- Existing user signing in loads their own portfolio
- Non-admin users never see the Admin nav link
- `is_admin()` function (SECURITY DEFINER) is still there — otherwise RLS recurses

## 🔍 9. Deploy path check

If I added files, update:
- `.gitignore` if it's a cache/secret (never commit)
- `netlify.toml` if the folder layout shifted
- `docs/PROJECT_CONTEXT.md` if the architecture or file layout changed

## 🔍 10. Documentation sync

If the change alters:
- Architecture → update `PROJECT_CONTEXT.md`
- Agent model/behaviour → update `MODEL_SELECTION.md`
- Output rules, data classification, regulatory wording → update `GUARDRAILS.md`
- Parked features or completed items → update `TODO.md`

Stale docs are worse than no docs.

---

## 📋 The pre-commit checklist (do this every time)

Copy-paste mentally before `git commit`:

```
[ ] 1. Impact audit: I've grepped for every caller of changed functions/fields.
[ ] 2. No orphan references to removed DOM ids / CSS classes / functions.
[ ] 3. Data model: loadState, saveState, getMetrics, viewHolding all still work.
[ ] 4. Currency: FX applied exactly once; metrics.holdings vs state.portfolio correct.
[ ] 5. Credentials: LOCAL_ONLY_SETTINGS covers any new secret fields.
[ ] 6. Agent contracts: Health Score regex + word limits + model IDs unchanged.
[ ] 7. UI: all 8 sections (Overview, Holdings, Performance, Market, Insights, Watchlist, NZ Tax, Admin) still render.
[ ] 7b. Any new grid table follows the defensive layout pattern (display:grid inline, min-width:0, ellipsis, esc).
[ ] 8. Auth: admin-only features still hidden from non-admins.
[ ] 9. Deploy: netlify.toml / .gitignore / folder layout correct.
[ ] 10. Docs: updated the relevant .md file if architecture/behaviour shifted.
```

Do not push until all 10 are verified or intentionally waived.

---

## 🚨 Symptoms that mean something regressed

| Symptom | Likely cause |
|---|---|
| "The page is blank" | JS error — orphan reference (failed #1 or #2). Open DevTools Console immediately. |
| "My API key keeps disappearing" | `LOCAL_ONLY_SETTINGS` missing a field (failed #5) |
| "Currency shows wrong value" | FX applied twice, zero times, or to wrong currency (failed #4) |
| "Can't see admin panel" | `is_admin()` function missing or policy recursion (failed #8) |
| "Old data lingering after CSV import" | Case mismatch or migration bug (failed #3) |
| "Agent card says error" | Model ID invalid or proxy down (failed #6) |
| "My snapshot chart is empty" | Table missing in Supabase or daily snapshot write failing silently |

When any of these surface, trace the corresponding checklist item first.
