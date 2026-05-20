# Outbound Integrations

_Last updated: 2026-05-19 · v0.16-integrations-stub_

This document describes the outbound integration layer InvestIQ uses to
push portfolio data to enterprise systems (Microsoft Dynamics 365 CRM
today; Apex Clearing / Forms by Air next). It's the read-this-first for:

- Anyone wiring a new outbound system
- Auditors / compliance reviewers asking "where does my data go?"
- The CEO presentation: "yes, this can talk to Harbour's stack."

---

## Architecture

```
┌──────────┐    HTTPS    ┌──────────────────┐   HTTPS   ┌────────────────────┐
│ Browser  │ ─────────→ │  InvestIQ Proxy   │ ────────→ │  Dynamics 365 / etc │
│ (no key) │   payload   │  (Render)         │  + token   │  Web API           │
└──────────┘            │                   │           └────────────────────┘
                        │  Holds Azure AD   │
                        │  service-principal│
                        │  credentials      │
                        └──────────────────┘
```

The browser **never holds** Azure AD or Dynamics credentials. The proxy
performs the OAuth 2.0 client-credentials flow with Microsoft Entra ID,
gets an access token, then POSTs the payload on the user's behalf.

This means:

- A leaked browser bundle leaks **no integration credentials**.
- Per-tenant credentials are managed in **one place** (Render env vars).
- Outbound calls are observable in proxy logs for compliance audit.

---

## Microsoft Dynamics 365 CRM

### What we push

Three canonical entities, generated client-side in `standalone/js/95-integrations.js`:

| Entity | When pushed | Maps to |
|---|---|---|
| **Contact** | After a user is approved + KYC complete | Standard Dynamics `contact` table with custom `investiq_*` fields |
| **Lead** | When a user signs up but isn't yet KYC'd | Standard `lead` table — converts to Contact on KYC pass |
| **PortfolioSnapshot** | Daily (via Supabase Edge Function — pending) | Custom entity `investiq_portfoliosnapshot` |

### Payload examples

**Contact** (real fields):
```json
{
  "firstname": "Gotham",
  "lastname": "Dinesh",
  "emailaddress1": "gothamdinesh@gmail.com",
  "investiq_userid": "550e8400-...",
  "investiq_created_at": "2025-09-12T10:00:00Z",
  "investiq_plan": "free",
  "investiq_role": "admin",
  "investiq_country": "NZ",
  "investiq_status": "active",
  "investiq_signup_source": "web"
}
```

**PortfolioSnapshot** (daily):
```json
{
  "investiq_userid": "550e8400-...",
  "investiq_snapshot_date": "2026-05-19",
  "investiq_currency": "NZD",
  "investiq_totalvalue": 22330.05,
  "investiq_totalcost": 21165.98,
  "investiq_totalgain": 1164.07,
  "investiq_totalgain_pct": 5.5,
  "investiq_holdings_count": 62,
  "investiq_aiscore": 62,
  "investiq_risklevel": "Elevated",
  "investiq_breakdown": "{\"stock\":{\"count\":42,\"value\":13610}, ...}"
}
```

### Today's behaviour (demo / preview mode)

- Admin enters a target Dynamics URL in **Settings → Admin →
  Microsoft Dynamics 365** (or leaves it blank).
- **Admin Panel → Test Dynamics 365 Sync** button builds the three
  payloads, POSTs them to `${PROXY}/api/integrations/dynamics`.
- The proxy logs what it received and returns a `200 preview` response
  showing what it *would* post.
- Round-trip is observable end-to-end without needing a real tenant.

### To enable real writes

1. Register an app in Microsoft Entra ID with Dynamics Web API permissions
   (`https://<tenant>.crm6.dynamics.com/.default`).
2. Add an Application User in the target Dynamics environment, mapped
   to the registered app.
3. On Render, set env vars:
   - `DYNAMICS_TENANT_ID` — Azure AD tenant
   - `DYNAMICS_CLIENT_ID` — App registration's Application (client) ID
   - `DYNAMICS_CLIENT_SECRET` — App registration's client secret
4. Update the `_proxy_dynamics` method in `claude_proxy.py` to switch from
   preview-mode 501 to:
   ```python
   token = self._exchange_azure_ad_token()
   urllib.request.urlopen(Request(
     f"{target}/api/data/v9.2/{entity.lower()}s",
     data=json.dumps(payload).encode(),
     headers={
       "Authorization": f"Bearer {token}",
       "Content-Type": "application/json",
       "OData-Version": "4.0",
       "Accept": "application/json"
     }, method="POST"
   ))
   ```
5. Admin sets the Dynamics endpoint URL in Settings.
6. Test via the Admin Panel button.

### Field mapping responsibility

| Side | Owner | Effort |
|---|---|---|
| InvestIQ payload shape | Us (frozen schema, versioned) | Done |
| Custom Dynamics fields | Harbour Dynamics admin | ~1 day to add `investiq_*` columns |
| Field-to-field map | Joint | ~half day |
| Workflow rules (e.g. KYC complete → convert Lead to Contact) | Harbour Dynamics admin | Per their flow |

---

## Apex Clearing (deferred to v0.17)

**Goal:** pull broker-side positions and transactions automatically.

**Approach:**
- Apex provides REST APIs for `/accounts`, `/positions`, `/transactions`.
- Authentication via API key + per-account access token.
- Proxy stores the API key as env var; per-user tokens stored encrypted
  in `profiles.apex_token_encrypted` (new column).
- Cron job in Supabase Edge Functions pulls positions nightly,
  reconciles against `investiq_portfolios.portfolio`.

**Estimate:** 2-3 weeks read-only; +4-6 weeks for order placement with
FMA wrap.

---

## Forms by Air (deferred to v0.17)

**Goal:** built-in onboarding form (KYC questions, risk profile, T&Cs).

**Approach:**
- Form on Forms by Air sends a webhook on submit.
- Supabase Edge Function receives the webhook, validates the signature,
  upserts the data into the user's `profiles` row.
- Triggers Dynamics Lead → Contact conversion.

**Estimate:** 3-5 days.

---

## Security notes

- Proxy enforces `X-Proxy-Secret` on every request (`PROXY_SECRET` env var).
- Rate-limited per origin to prevent abuse.
- All outbound credentials are server-side only — never in the client bundle.
- Every outbound call is logged with entity + field names (no PII values)
  for compliance audit.
- Failed Azure AD token exchanges are retried with exponential backoff
  but never log the token itself.

---

## Compliance audit trail

For every outbound push:

1. The client logs a row in `investiq_activity_log` (table) with
   `event_type='dynamics_sync'` and the entity + record id.
2. The proxy logs the field names (not values) to stdout (captured in
   Render's log retention).
3. Dynamics itself records the create/update in its own audit log.

End-to-end, an auditor can reconstruct what was sent, when, by whom,
and the response code — without exposing the underlying PII values.
