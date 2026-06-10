# Harbour Edition — white-label / multi-tenant build

_Created 2026-06-06 (v0.29). Trial of InvestIQ inside Harbour, approved by the CEOs._

## Decision: ONE codebase, edition flag (NOT a fork)

A separate Harbour file was rejected — a fork rots (the old `.claude/worktrees/…` copy was already ~6 releases behind). Instead a single `EDITION` config drives branding, theme, feature flags, and per-tenant Supabase. Fixes/features land once, for both editions.

## How it works

`standalone/js/00-config.js`:
- `EDITIONS` map — `personal` and `harbour`. Each has: `name`, `wordmark`, `tagline`, `theme`, `features`, `supabaseUrl`, `supabaseKey`.
- `detectEdition()` — **hostname is authoritative**: hostname contains `harbour` → `harbour`; else `?edition=<id>` as a **transient** preview override (NOT persisted); else `personal`. Also clears any stale `localStorage.investiq_edition`. _(v0.29.5: removed localStorage persistence — it was sticking the personal site on Harbour after one `?edition=harbour` preview.)_
- `EDITION` — the resolved edition object. `<html data-edition="…">` set immediately so CSS reacts before paint.
- `PLATFORM_CONFIG.supabaseUrl/Key` now come from `EDITION` (per-tenant data isolation). Proxy is shared.

`standalone/index.html`:
- `applyEdition()` (called first in `init()`): sets `document.title`, rewrites all `.brand-mark` wordmarks (skips the TraderIQ sub-brand), updates `#navTagline` + `#drawerTagline`, and applies feature flags.
- Feature flags: `features.family=false` → removes `#familyNavLink` + `#familyInviteBanner` and the Family nav group. `features.goals=false` → removes the Goals pill from the Planning group.
- `:root[data-edition="harbour"]` CSS block overrides the brand accent/CTA (currently a **placeholder teal** — see below).

## Harbour edition scope (per CEO trial)
- ❌ Family (removed entirely)
- ❌ Goals (removed from Planning)
- ✅ Kept: Overview, Portfolio (Holdings/Performance/Dividends), Intelligence (AI Insights/Ask IQ/Market/News), Planning (Calendar/NZ Tax/Reports), Watchlist, TraderIQ

## Preview locally / on the live URL
Append `?edition=harbour` to the URL (e.g. `investiq-nz.netlify.app/?edition=harbour`). The gate/login screen shows the Harbour wordmark + theme. (Full login needs the Harbour Supabase keys — see pending.) To switch back: `?edition=personal`.

## Theme — DONE (v0.30, light-only, palette-only)
Built **strictly** from the official Harbour Brand Colours guide. **Light-only** (the palette has no true-dark; `EDITION.lightOnly: true` forces light + hides the theme toggle). "All-white minimal" — white cards on a light-grey app, Harbour Blue as accent only:
- Background `#E4E7E9` · cards/sidebar `#FFFFFF` · borders `#BFC8CC` · border-strong `#6CA0B1`
- Text = brand slate `#44546A` (secondary/muted = slate at 72% / 52% alpha — no off-palette greys)
- Accent / links / CTA = Harbour Blue `#005A79`
- **Gains = Cyan `#2BB0D4`**, **Losses = Bronze `#C29144`** (palette-only — the guide has no green/red; chosen per owner). IQ/dividend highlights = bronze.
- Chart series drawn from blue / cyan / aqua / blue-grey / slate / sand / bronze.
- ⚠️ Readability note: cyan/bronze are lighter than conventional green/red on white — gain/loss numbers render bold; revisit if they feel weak in the live trial.
- Single `:root[data-edition="harbour"]` block (specificity 0,2,0 beats `:root`); the legacy InvestIQ `.brand-icon` tiles are hidden.
- Brand mark = the **sails icon** (`standalone/assets/harbour/harbour-sails-blue.png`, reads on light + dark) + "Harbour" wordmark. Favicon + mobile theme-color also set to Harbour Blue.
- Full-logo SVGs available for larger placements (gate/reports/email): `harbour-logo-blue.svg`, `harbour-logo-white.svg`.

## Font — DONE (Harmonia Sans, v0.29.4)
Owner confirmed Harbour holds an internal Monotype licence covering this use. **Harmonia Sans Std** (Light/Regular/SemiBd/Bold/Black → weights 300/400/600/700/800) is embedded via `@font-face` in `standalone/fonts/harbour/` and applied to the body/controls **only** for the Harbour edition (lazy-loaded — personal edition pays no cost). Numbers keep JetBrains Mono. Serrano Pro (a BNZ font in the zip) is unused.

## ⏳ PENDING (blocked on you)
1. **Harbour Supabase project** — create a separate project (data isolation), then give me the URL + anon key to replace `<HARBOUR_SUPABASE_URL>` / `<HARBOUR_SUPABASE_ANON_KEY>` in `EDITIONS.harbour`. Run the migrations there too. (Until then, `?edition=harbour` shows the branded gate but can't log in.)
2. **Confirm tagline** — currently "Portfolio Intelligence" (placeholder). And confirm the **font** question above.
3. **Deploy** — a separate Netlify site/subdomain (e.g. `harbour.investiq…`) from the same repo; the hostname auto-selects the Harbour edition. (Same Render proxy is fine.)
4. **Deferred polish** — deeper Family gating (any Family tab inside Settings), Harbour-specific copy, and confirm whether TraderIQ stays for the trial.

## Not changed
- Personal edition is byte-for-byte behaviour-identical (default detection → `personal`, same Supabase, same "InvestIQ" branding/theme).
