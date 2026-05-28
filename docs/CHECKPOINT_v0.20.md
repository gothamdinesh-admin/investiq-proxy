# Checkpoint — v0.20-auth-data-safety

_Created: 2026-05-28 · Tag: `v0.20-auth-data-safety` · Branch: `main` @ d81d1ee_

This is a comprehensive "where things stand" snapshot taken after the v0.18 2FA-lockout + cloud-wipe incident was fully resolved and the architecture pass landed. Use it as the first read when picking up a new session.

---

## 1. Headline

InvestIQ is at v0.20. The last three weeks closed off a long arc:

- **v0.13 → v0.17** — feature build-out (TraderIQ, Goals, FIF polish, Calendar, Reports, PWA, mobile tour fixes).
- **v0.18** — FIF Method Optimiser (NZ-unique) + 2FA attempt.
- **v0.18.1 → v0.19.2** — recovery from the 2FA-lockout + cloud-wipe incident (the foundational data-safety failure).
- **v0.20** — architect-level redesign of auth + data-safety. Documented, guarded, layered.

Tree is clean. App lints. All 15 sections render. The login path is back to a single proven layer (email + password). 2FA is disabled at the UI level until it can ship with mandatory recovery codes.

---

## 2. What works (verified end-to-end)

| Area | State |
|---|---|
| Login (email + password) | ✅ Reliable. `ENABLE_LOGIN_MFA = false` keeps the unproven 2FA path out of the critical line. |
| Sign-out | ✅ `scope: 'local'` + 4s timeout — no more hangs. |
| Cloud load | ✅ Cache/staleness guard prevents stale-cloud reverting a just-imported CSV. |
| Cloud save | ✅ Empty-portfolio guard refuses to overwrite a non-empty cloud (the v0.18.9 fix that should have existed from day one). |
| Local auto-backup | ✅ Rolling last-3 non-empty snapshots in `investiq_autobackup`. Never overwritten by an empty state. Survives sign-out. |
| Daily snapshots | ✅ `investiq_snapshots` with $0-entry guard since v0.14.2. NZD cost-basis reconstructable via fx round-trip. |
| Admin recovery tools | ✅ Restore from Snapshot, Restore from Local Auto-Backup, Verify Backup Integrity, Clean $0 Snapshots — all four wired. |
| Supabase Pro DR | ✅ Daily backups, 7-day retention (worst-case escape hatch). |
| All 15 sections | ✅ admin · calendar · dividends · family · goals · holdings · insights · market · news · overview · performance · reports · tax · trader · watchlist |

---

## 3. Defense-in-depth — the data-safety architecture

Encoded in `docs/AUTH_DATA_SAFETY.md`. Three layers, four rules.

```
Layer 3   Supabase daily backups (7d, Pro) + investiq_snapshots (daily)
Layer 2   investiq_portfolios (live cloud) — empty-save GUARD
Layer 1   investiq_v2 (live local) + investiq_autobackup (rolling 3, non-empty only)
```

The four rules (full text in the doc):
1. Never put unproven auth in the critical login path.
2. Every destructive-capable write needs a guard.
3. Defense in depth for data — local rolling + guarded cloud + daily snapshots + DR.
4. Every lockout needs a documented escape hatch.

---

## 4. Tag history (rollback points)

Each is `git checkout <tag>` to a known-good state:

| Tag | What |
|---|---|
| `v0.13-trader-iq` | TraderIQ section (trades + setups) |
| `v0.14-invest-updates` | Holdings KPI strip, perf polish, daily snapshot $0 guard |
| `v0.15-feature-pack` | Goals & Targets, Tax (FIF) polish, multi-feature pack |
| `v0.16-integrations` | Integration improvements + reliability |
| `v0.17-calendar-reports` | Calendar + Reports + PWA install + mobile tour fixes |
| `v0.18-fif-optimiser` | FIF Method Optimiser (FDR vs CV) — NZ-unique |
| `v0.20-auth-data-safety` | **Current.** Auth + data-safety architecture pass. |

(There is no `v0.19` tag — that work landed as patch commits during the incident recovery and was folded into v0.20.)

---

## 5. Open / pending verifications

- [ ] **2FA factor row cleanup** — if the user's `auth.mfa_factors` row is still present from the v0.18 attempt, run the documented SQL: `delete from auth.mfa_factors where user_id = (select id from auth.users where email = 'gothamdinesh@gmail.com');`. Confirm via Supabase dashboard that the row is gone.
- [ ] **Click-test the login loop** on the live Netlify URL: sign out → sign in → portfolio loads → holdings count matches cloud.
- [ ] **Click-test Admin → Verify Backup Integrity** — should show live local count = cloud count = latest auto-backup count = latest snapshot count, with no drift flagged.
- [ ] **Confirm rolling auto-backup populates** — make any state change, check `localStorage.investiq_autobackup` is non-empty with a recent timestamp.

---

## 6. Known constraints — do NOT change without a redesign

| Constraint | Where | Why |
|---|---|---|
| `ENABLE_LOGIN_MFA = false` | `45-auth-security.js` | Must stay false until recovery codes + throwaway-account test loop ship. |
| Empty-save guard | `30-cloud.js saveToSupabase()` | Removing it re-opens the v0.18 cloud-wipe path. |
| `clearLocalUserData` must NOT touch `investiq_autobackup` | inline script in `index.html` | Sign-out would clobber the last good local copy. |
| `claudeApiKey` never persisted | `20-state.js saveState()` | Proxy holds it server-side. Persisting would leak via cloud sync. |
| `_allowEmptyCloudSave` only set by Clear-All-Data flow | `30-cloud.js` | Bypassing this flag = removing the empty-save guard. |
| 2FA enrollment UI must remain unreachable | `45-auth-security.js` | Re-exposing it without recovery codes = lockout risk. |

---

## 7. What's next (suggested pick from TODO.md)

The data-safety incident burned the immediate roadmap. Sensible next picks:

1. **2FA done properly** — recovery codes generated at enrol, hashed server-side, shown once, accepted at login. Test on a throwaway account. Then re-enable `ENABLE_LOGIN_MFA`.
2. **OR pivot to Harbour-pitchable feature work** — e.g. multi-portfolio support, polished PDF reports, public read-only share links. Auth & data-safety is now solid enough that feature work won't sit on a broken foundation.
3. **OR clear the P0 backlog** — verify the 2FA factor cleanup, end-to-end Verify Backup Integrity, and tick off the C1/C2 user-action items in TODO.md (Anthropic + Supabase + Netlify + Render spend caps).

---

## 8. Next-session pickup brief (paste-ready)

> Picking up from v0.20-auth-data-safety. Tree is clean, app lints, login loop is reliable (MFA disabled at UI), defense-in-depth data safety is in place (rolling local autobackup + guarded cloud + daily snapshots + DR). Read `docs/AUTH_DATA_SAFETY.md` and `docs/CHECKPOINT_v0.20.md` first. Confirm pending verifications in CHECKPOINT §5 are done before any new feature work.

Last reviewed: 2026-05-28.
