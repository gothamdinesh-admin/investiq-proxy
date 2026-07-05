# Harbour IQ — Client Platform Architecture & Compliance Roadmap

_Direction set 2026-07-05. Supersedes the "client self-imports" assumption.
This is the plan for turning Harbour IQ into a Harbour-provisioned client
portal holding real investor data — and what has to be true before that._

---

## 1. The model (agreed)

- **Harbour provisions clients.** A client does **nothing** — no data entry, no
  self-import. Harbour staff load the data; the client just logs in and sees
  their holdings.
- **The unique account id is the join key.** Every account in the APEX feed has
  a stable id (registry UUID, else HR account number, else client number). A
  Harbour IQ login is linked to that id; their holdings are whatever rows carry
  it. Account names in Harbour IQ mirror APEX exactly.
- **Two roles.** `staff` (uploads all clients, sees everything) and `client`
  (sees only their own account). The current admin account = staff for now.
- **Bulk, not per-client.** Staff upload the whole APEX workbook once; it fans
  out to per-client records by id.

## 2. Target data model

```
profiles            (existing) + role: 'staff' | 'client'
                                + apex_id  (nullable) — links a client login to their account

client_accounts     apex_id (unique)      -- the join key
                    account_name
                    updated_at

client_holdings     apex_id (FK)          -- keyed by the account id, NOT the user
                    fund_code (HiPort)
                    value                 -- $ closing balance from APEX
                    as_at
```

**RLS:**
- `staff` → full read/write on `client_accounts` + `client_holdings`.
- `client` → read only rows where `apex_id = (select apex_id from profiles where id = auth.uid())`.
- Provisioning = set a client login's `profiles.apex_id`. From then on their
  holdings appear automatically; they touch nothing.

**Ingestion (staff bulk load):** move parsing **server-side** for scale — staff
upload the workbook to a secured Edge Function that parses and upserts
`client_accounts` / `client_holdings` by id. Keeps ~1,000 clients' PII (incl.
IRD numbers) out of the browser and gives one audited ingestion point. (The
current in-browser single-account importer stays fine for demos.)

## 3. What's built vs what's next

| | Status |
|---|---|
| In-browser APEX parse, account picker, single-account import (v0.69) | ✅ prototype |
| Unique-id capture as the join key (v0.69a) | ✅ |
| `role` split (staff/client) + `apex_id` on profiles | ⏳ Phase 1 |
| `client_accounts` / `client_holdings` tables + RLS | ⏳ Phase 1 |
| Server-side bulk ingestion Edge Function | ⏳ Phase 2 |
| Client provisioning flow (link login → apex_id) | ⏳ Phase 2 |

> ⚠️ **Hard line:** do **not** bulk-load real client data (names, IRD numbers,
> balances) into the current prototype stack. It runs on personal
> Netlify/Render/Supabase/Anthropic accounts and has no formal controls. Keep to
> dummy data or a single self-owned account until §4 Phase A + B are done and
> Harbour compliance has signed off.

---

## 4. Compliance & assurance roadmap

Handling NZ investors' financial data + PII (IRD numbers) puts this squarely in
regulated territory. The certifications are **organisational + infrastructure**
achievements — a prototype on personal cloud accounts cannot hold them. Sequence:

### Phase A — Legal baseline & ownership (do first; weeks)
1. **NZ Privacy Act 2020** (legal requirement, not a cert). 13 IPPs, mandatory
   breach notification to the Office of the Privacy Commissioner, cross-border
   disclosure rules (know where Supabase/Anthropic process data). *Mostly
   started — in-app privacy notice + deletion runbook exist.* Add: a data map
   (what/where/who), retention schedule, and a breach-response plan.
2. **Infrastructure ownership.** Move off personal accounts to **Harbour-owned**
   (or Harbour-contracted) Supabase / hosting / AI. Certification is impossible
   otherwise, and it's the real governance blocker. (Tracked in
   `PRODUCTION_READINESS.md` P2.)
3. **FMA / internal compliance sign-off.** As an FMC-licensed manager, Harbour
   has obligations for **outsourcing, operational resilience, and technology
   systems**. Any tool holding investor records must go through Harbour's own
   compliance/risk process — this is the *actual* gate to go live, and it runs
   in parallel with everything else. Start the conversation now.

### Phase B — Technical controls (months; needed before real data at scale)
4. Per-client table + RLS + role split (§2). Least-privilege access. Encryption
   at rest (Supabase/Postgres default) + in transit (TLS, already).
5. **Audit logging** of every access to client data (who viewed which account).
   The activity-log table is a start; extend to data-access events.
6. Harden the app: replace the Tailwind CDN + add CSP (PRODUCTION_READINESS P1),
   MFA enforced for staff, per-user rate limits, secret rotation, dependency
   pinning (SRI already done for the CDN scripts).
7. Backup + restore drill; documented incident response.

### Phase C — Formal certification (6–18 months; organisational programme)
8. **SOC 2** — AICPA Trust Services Criteria (Security, Availability,
   Confidentiality, Processing Integrity, Privacy). **Type I** = controls
   designed correctly at a point in time; **Type II** = operating effectively
   over 3–12 months. This is the certification enterprise/financial partners
   usually ask a SaaS for. Path: readiness assessment → remediate → Type I →
   observation window → Type II. You **inherit** controls from certified
   sub-processors (Supabase, AWS, Netlify are SOC 2 / ISO 27001) but still need
   your **own** ISMS and evidence.
9. **ISO/IEC 27001** — certified Information Security Management System (ISMS):
   scope, risk assessment, Statement of Applicability against ISO 27002
   controls, internal audit, management review, then external Stage 1 + Stage 2
   audits. ~9–15 months. Often pursued alongside SOC 2 (large control overlap).
10. **SOC 1 / ISAE 3402** — controls relevant to **financial reporting**. Matters
    because Harbour IQ surfaces investor holdings/valuations. APEX (the
    administrator) will already hold an ISAE 3402 / SOC 1 report; if Harbour IQ
    becomes part of the investor-record chain, this is the relevant assurance
    standard. *(This is likely the "HIPO" you had in mind — ISAE 3402 / SOC 1,
    not HIPAA.)*

### Not applicable
- **HIPAA** — US healthcare data law. Does **not** apply to NZ fund management.
  If that's what "HIPO" meant, we can drop it. (NZISM — the NZ Information
  Security Manual — is a useful control reference if you ever touch government
  data, but not required here.)

## 5. Recommended sequence
1. **Now:** keep building the UI/model with **dummy or single-owner data only**.
2. **Start immediately (long lead time):** Harbour IT infra ownership + Harbour
   compliance/FMA conversation (Phase A2/A3).
3. **Then:** Phase 1 tables + RLS + roles → Phase 2 server ingestion + provisioning.
4. **Only then, with real client data:** the Phase C certification programme,
   which Harbour's risk/compliance function owns (not a solo-dev task).

The honest framing for Harbour: the *product* can be demo-ready fast, but
holding real investor data is an **organisational** commitment (owned infra,
compliance sign-off, an audited ISMS) — not a code milestone.
