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
- **Phase 1 — DONE (v0.33):** Supabase `cms_content` table (migration `017_cms_content.sql` — run in BOTH projects; read open, write admin-only via RLS). `loadCmsOverrides()` pulls the active edition's rows into `_cmsOverrides` at startup (before login, so gate branding reflects overrides) and re-hydrates. **Admin → Content** card (`renderCmsEditor`/`saveCmsKey`/`resetCmsKey`) edits the active edition's copy live; blank value = revert to code default. No-ops gracefully if the table isn't there yet. **Activation: run migration 017 in each project.**
- **Phase 2 — DONE (v0.35): Content Studio.** A dedicated admin page (`#section-cms`, opened from Admin → "Open Content Studio", or `showSection('cms')`) with a SilverStripe-style two-pane editor: site areas on the left (driven by `CMS_SCHEMA`, grouped by section — Branding/Login, Overview, Holdings, Intelligence, Planning/Reports, Watchlist, Mobile), the selected area's fields on the right. Each field saves to `cms_content` for the active edition and re-hydrates live. Section **headings** are now editable (wrapped in `<span data-cms="section.*.title">`, hydrated at startup). **To add a field to the Studio:** add it to `CMS_SCHEMA` (under a group) + tag its element `data-cms` (static) or use `cms()` (dynamic). Verified live: editing a field updates the real section heading instantly.
- **Phase 2.1 — DONE (v0.36): theme colours in the Studio.** New "Theme & colours" group with **colour-picker** fields. `CMS_THEME_VARS` maps each key → a CSS custom property; `applyCmsTheme()` writes saved overrides as inline custom properties on `<html>` (beats the stylesheet) at load + on save/reset. The Harbour chrome (sidebar/nav/gate) is now `var(--accent)`, so editing the brand colour recolours the whole identity — chrome, links, CTAs — live. Verified: setting `theme.accent` recoloured the sidebar instantly. To add a colour: add a `type:'color'` field to the `theme` group + an entry in `CMS_THEME_VARS`.
- **Phase 2+ — TODO:** widen field coverage (subtitles, button labels, empty-states per section) by extending `CMS_SCHEMA` + tagging; remaining non-text field types:
  - **Theme colours** — surface the per-edition CSS-variable palette (currently in the `:root` / `[data-theme="light"]` / `[data-edition="harbour"]` blocks) as editable values injected as a `<style>` override.
  - **AI agent prompts & labels** — `AGENT_DEFS` (+ harbour overrides) in `70-ai.js` editable without a deploy.
  - **Feature flags & nav** — `EDITION.features`, `NAV_GROUPS`, `SECTION_LABELS/ICONS`.

## Notes
- Personal edition output is unchanged by Phase 0a (registry reproduces prior strings exactly via interpolation — verified).
- `supportEmail`: personal `gothamdinesh@gmail.com`; harbour `dinesh.muthusamy@harbourasset.co.nz` (TODO confirm the right Harbour support contact).
