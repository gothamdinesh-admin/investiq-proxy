# Content / CMS — edition-aware content layer

_Started 2026-06-15 (v0.32). Goal: manage every editable piece of UI content per edition (personal / harbour), eventually from an in-app admin editor. Built in phases so each ships on its own._

## Why
The app had ~220 editable strings/values scattered across HTML, JS, and CSS. That fragmentation caused brand "leaks" (Harbour users seeing "InvestIQ"). The CMS centralises content into one edition-aware layer; fixing leaks and enabling a future live editor are the same project.

## Architecture
`standalone/js/05-content.js` (loaded right after `00-config.js`, before everything else):
- **`CONTENT`** — `{ common, personal, harbour }`. `common` keys use `{name}`/`{tagline}`/`{supportEmail}` interpolation (auto-filled from the active `EDITION`), so most copy needs no per-edition duplication. Add an edition-scoped key only when the *wording* differs, not just the brand token.
- **`cms(key, vars)`** — resolves `_cmsOverrides[edition][key]` → `CONTENT[edition][key]` → `CONTENT.common[key]` → the key itself (missing keys stay visible). Interpolates `{...}` tokens. Global; usable from any module + the inline script + at render time.
- **`hydrateContent()`** — fills the DOM, idempotent. Called from `applyEdition()`:
  - `[data-cms="key"]` → `textContent = cms(key)`
  - `.edition-name` → `EDITION.name`
  - `.support-email` → `EDITION.supportEmail`
  - `.support-email-link` → text + `mailto:` href

## How to add a new editable string
1. Add a key to `CONTENT.common` (use `{name}` etc. if it's just branding).
2. In **HTML**: tag the element `data-cms="your.key"` (its text is auto-filled).
   In **JS render code**: use `cms('your.key')` (resolves at call time).
3. Done — it's edition-aware. Phase 1 will make it overridable live.

## Phase status
- **Phase 0a — DONE (v0.32):** registry + `cms()` + `hydrateContent()`. Migrated branding/copy leaks: onboarding welcome, signup/invite copy + per-edition `supportEmail`, "… Cloud" sync label, report footer/title/data-source, onboarding-tour welcome. Per-edition `supportEmail` added to `EDITIONS`.
- **Phase 0b — TODO:** remaining copy — `manifest.json` + `<title>`/meta per edition (PWA name), TraderIQ "Import from …" label, PWA-install prompt strings (`85-calendar-reports.js` 545/549/571), onboarding-card icon colours, section titles + empty-state copy.
- **Phase 1 — TODO (the actual editor):** Supabase `cms_content` table (`edition, key, value`), load into `_cmsOverrides` at startup, merge over `CONTENT`. Admin → Content editor UI to edit per edition live. Extend coverage to the other approved categories via the editor:
  - **Theme colours** — surface the per-edition CSS-variable palette (currently in the `:root` / `[data-theme="light"]` / `[data-edition="harbour"]` blocks) as editable values injected as a `<style>` override.
  - **AI agent prompts & labels** — `AGENT_DEFS` (+ harbour overrides) in `70-ai.js` editable without a deploy.
  - **Feature flags & nav** — `EDITION.features`, `NAV_GROUPS`, `SECTION_LABELS/ICONS`.

## Notes
- Personal edition output is unchanged by Phase 0a (registry reproduces prior strings exactly via interpolation — verified).
- `supportEmail`: personal `gothamdinesh@gmail.com`; harbour `dinesh.muthusamy@harbourasset.co.nz` (TODO confirm the right Harbour support contact).
