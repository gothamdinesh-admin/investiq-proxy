# Auth & Data-Safety Architecture

_v0.20 · 2026-05-19 · Written after the v0.18 2FA-lockout + cloud-wipe incident. This is the design of record for how InvestIQ keeps a user signed in safely and never loses their portfolio._

---

## 1. The incident that prompted this (root-cause)

A 2FA feature was added directly to the login critical path. Its verify step was flaky on the live Supabase project, which:
1. Left the session at AAL1 (half-authenticated) → portfolio load failed → app showed empty.
2. **There was no guard** stopping the debounced auto-save from then writing that empty state over the cloud → 62 holdings wiped from `investiq_portfolios`.
3. The user couldn't disable the broken 2FA because unenrolling a verified factor needs AAL2 — a catch-22.

**Three failures compounded:** unproven auth in the critical path, no empty-save guard, no lockout-safe 2FA. This document fixes the architecture so none can recur.

---

## 2. Threat model (what we defend against)

| Threat | Likelihood | Impact | Defense |
|---|---|---|---|
| Failed cloud load → empty local → auto-save wipes cloud | **Happened** | Catastrophic (data loss) | Empty-save guard + local rolling backup |
| Corrupt / cleared `investiq_v2` localStorage | Medium | High | Local rolling auto-backup (separate key) |
| Cloud row deleted/corrupted | Low | Catastrophic | Daily snapshots + Supabase backups + restore tool |
| 2FA lockout (lost device / broken verify) | **Happened** | High | Recovery codes (mandatory) + SQL escape documented |
| Session hijack on shared device | Medium | High | Idle timeout + sign-out clears local cache |
| Stale token rejected by Edge Functions | **Happened** | Medium | `_getFreshJwt()` refresh before authed calls |

---

## 3. Defense-in-depth: 3 layers of data safety

```
                 ┌─────────────────────────────────────────┐
   Layer 3       │  Supabase daily backups (7-day, Pro)     │  ← disaster
   (cloud DR)    │  + investiq_snapshots (daily, per-holding)│     recovery
                 └─────────────────────────────────────────┘
                 ┌─────────────────────────────────────────┐
   Layer 2       │  investiq_portfolios (cloud, live)       │  ← source of
   (cloud live)  │  GUARDED: empty local never overwrites   │     truth
                 │  a non-empty cloud (saveToSupabase guard) │
                 └─────────────────────────────────────────┘
                 ┌─────────────────────────────────────────┐
   Layer 1       │  investiq_v2 (localStorage, live)        │  ← working
   (local)       │  + investiq_autobackup (rolling last 3,  │     copy
                 │    non-empty only) ← NEW                  │
                 └─────────────────────────────────────────┘
```

### Layer 1 — Local working copy + rolling auto-backup *(new in v0.20)*
- `investiq_v2` — the live local state (unchanged).
- `investiq_autobackup` — a **separate** key holding the **last 3 non-empty** portfolio snapshots, each with timestamp + holdings count.
- Written by `_pushAutoBackup()` on every `saveState()` **only when the portfolio is non-empty**. An empty state never overwrites the rolling backup — so the last good local copy always survives, even if `investiq_v2` is cleared or zeroed.
- Recovery: `restoreFromAutoBackup()` (admin tool) rebuilds `state.portfolio` from the most recent rolling backup.

### Layer 2 — Cloud live + empty-save guard *(shipped v0.18.9)*
- `investiq_portfolios` is the source of truth across devices.
- `saveToSupabase()` **refuses to write an empty portfolio over a non-empty cloud** unless `_allowEmptyCloudSave` is set (only the explicit Clear-All-Data flow sets it). A failed load can no longer cascade into a cloud wipe.
- If the guard can't even read the cloud to check, it **skips the save** (fail-safe, never destructive).

### Layer 3 — Cloud disaster recovery
- `investiq_snapshots` — daily per-holding snapshot (guarded against $0 entries since v0.14.2). Full breakdown stored, enabling exact NZD reconstruction.
- `adminRestoreFromSnapshot()` — one-click rebuild from the latest good snapshot.
- Supabase Pro daily backups (7-day retention) — full-DB restore via dashboard for worst case.

---

## 4. Save-health visibility *(new in v0.20)*
- On every successful cloud save, record `investiq_last_good_save = { at, count }` in localStorage.
- Admin **"Verify Backup Integrity"** tool compares: live local count vs cloud count vs latest auto-backup count vs latest snapshot count — and flags any drift. Turns "is my data safe?" from a guess into a check.

---

## 5. Session model

| Aspect | Design |
|---|---|
| Provider | Supabase Auth (GoTrue) — email/password + magic link |
| Token | JWT access token, ~1h expiry, auto-refresh by supabase-js |
| Authed Edge calls | Always via `_getFreshJwt()` — refreshes if token is missing or <60s from expiry (fixes stale-Bearer rejections) |
| Sign-out | `scope: 'local'` + 4s timeout — clears this device only, never hangs on a server revoke. Local teardown runs regardless. |
| Idle timeout | 2h, focus-aware (pauses while tab is visible+focused) |
| Shared-device safety | Sign-out + fresh sign-in both clear local caches (portfolio, trades, goals, sentiment) |
| Fresh sign-in | `clearLocalUserData` then `loadFromSupabase` — cloud is authoritative. Guarded by Layer 2 so a failed load can't wipe cloud. |

---

## 6. Lockout-proof 2FA design (for when it's re-enabled)

**Status: DISABLED at login** (`ENABLE_LOGIN_MFA = false`). The enrollment code exists but is unreachable from the UI. It will only return as a real feature when ALL of the following are true:

### Mandatory requirements before 2FA touches login again
1. **Recovery codes** — generated at enrolment, shown once, hashed server-side. The user can complete login with a recovery code if they lose their authenticator. Without this, 2FA = lockout risk. **Non-negotiable.**
2. **Tested on a throwaway account first** — full enable → sign-out → sign-in → verify → recover-with-code → disable loop, proven on the live Supabase project.
3. **`challengeAndVerify` single-call path** — already adopted; the two-step challenge+verify was where the original break occurred.
4. **AAL2-aware unenroll** — disabling a verified factor must work via an in-app code-elevation step (implemented) OR a documented SQL escape (implemented). Never a dead end.
5. **Admin force-remove** — an admin can clear any user's locked factor (covered by the documented `delete from auth.mfa_factors` SQL; productionise as an admin RPC for the Harbour build).

### For the Harbour pitch
Don't pitch the current TOTP build. Pitch the **target**: org-enforced MFA via **Microsoft Entra ID SSO** (staff sign in with their work account — Harbour's IdP handles MFA + recovery centrally), with TOTP as a fallback for non-SSO retail users, recovery codes mandatory. That's the enterprise-correct model and it sidesteps the per-user lockout problem entirely.

---

## 7. The lesson, encoded as rules

1. **Never put unproven auth in the critical login path.** Feature-flag it (`ENABLE_LOGIN_MFA`), test on a throwaway, then flip.
2. **Every destructive-capable write needs a guard.** The empty-save guard should have existed from day one.
3. **Defense in depth for data** — local rolling backup + guarded cloud + daily snapshots + DR backups. No single point of loss.
4. **Every lockout needs an escape hatch** — recovery codes, SQL, or admin override. Document it before shipping.

---

## 8. Recovery playbook (operator quick-reference)

| Symptom | Recovery |
|---|---|
| App shows empty, cloud still has data | Admin → **Force Reload from Cloud** |
| Cloud wiped (0 holdings), snapshots intact | Admin → **Restore from Snapshot** |
| Cloud + snapshots gone, local intact | Admin → **Restore from Local Auto-Backup** *(v0.20)* |
| Everything local gone, cloud intact | Just sign in — loads from cloud |
| All gone | Supabase Dashboard → Database → Backups → restore (Pro, 7-day) |
| 2FA lockout | `delete from auth.mfa_factors where user_id = (select id from auth.users where email='…')` then refresh |
| "Is my data safe?" | Admin → **Verify Backup Integrity** |

Last reviewed: 2026-05-19. Next review: before any change to auth, save, or load paths.
