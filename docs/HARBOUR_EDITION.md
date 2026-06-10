# Harbour Edition — white-label / multi-tenant build

_Created 2026-06-06 (v0.29). Trial of InvestIQ inside Harbour, approved by the CEOs._

## Decision: ONE codebase, edition flag (NOT a fork)

A separate Harbour file was rejected — a fork rots (the old `.claude/worktrees/…` copy was already ~6 releases behind). Instead a single `EDITION` config drives branding, theme, feature flags, and per-tenant Supabase. Fixes/features land once, for both editions.

## How it works

`standalone/js/00-config.js`:
- `EDITIONS` map — `personal` and `harbour`. Each has: `name`, `wordmark`, `tagline`, `theme`, `features`, `supabaseUrl`, `supabaseKey`.
- `detectEdition()` — resolves the active edition by: `?edition=<id>` (also stored to `localStorage.investiq_edition`) → stored value → hostname contains `harbour` → default `personal`.
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

## ⏳ PENDING (blocked on you)
1. **Harbour brand kit** — official hex colours + logo. Replace the placeholder palette in the `:root[data-edition="harbour"]` block and confirm `EDITIONS.harbour.wordmark` / `name` / `tagline`.
2. **Harbour Supabase project** — create a separate project (data isolation), then give me the URL + anon key to replace `<HARBOUR_SUPABASE_URL>` / `<HARBOUR_SUPABASE_ANON_KEY>` in `EDITIONS.harbour`. Run the migrations there too.
3. **Deploy** — a separate Netlify site/subdomain (e.g. `harbour.investiq…`) from the same repo; the hostname auto-selects the Harbour edition. (Same Render proxy is fine.)
4. **Deferred polish** — deeper Family gating (any Family tab inside Settings), Harbour-specific copy, and confirm whether TraderIQ stays for the trial.

## Not changed
- Personal edition is byte-for-byte behaviour-identical (default detection → `personal`, same Supabase, same "InvestIQ" branding/theme).
