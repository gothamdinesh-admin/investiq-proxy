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

## Apex Clearing

### What we pull

Three Apex REST endpoints proxied through `/api/integrations/apex`:

| Endpoint | What it returns | When pulled |
|---|---|---|
| `/positions` | Current broker-side holdings (symbol, qty, avg cost, market value) | Nightly cron + manual refresh button |
| `/transactions` | Last 90 days of buys/sells/dividends/fees | Nightly cron |
| `/account` | Cash balance, buying power, account status | On-demand |

### Today's behaviour (demo / preview mode)

- Admin enters an Apex Account ID in **Settings → Admin → Apex Clearing**
  (or leaves blank).
- **Admin Panel → Test Apex Sync** pulls all three endpoints via the
  proxy, which returns deterministic mock data shaped exactly like the
  real Apex responses.
- The browser-side reconciler compares Apex positions against the
  user's current InvestIQ portfolio and reports the diff:
  *in both* / *only in Apex* / *only in ours*.
- Lets the demo show "broker says you own AAPL but InvestIQ doesn't
  have it — add to portfolio?" UX without a real Apex account.

### To enable real reads

1. Apex provides an API key for the integration partner — set as
   `APEX_API_KEY` env var on Render.
2. Per-user account access tokens captured during onboarding, stored
   encrypted in `profiles.apex_token_encrypted` (column add in a
   future migration).
3. Update `_proxy_apex` in `claude_proxy.py` to switch the
   preview-mode mock return for a real `urllib.request` call to
   `https://api.apexclearing.com/v1/<endpoint>` with the per-user token.
4. Add a Supabase Edge Function `apex-nightly-sync` on a pg_cron
   schedule to pull positions for every user with a token.

### Read-only vs order placement

| Capability | Effort | Compliance load |
|---|---|---|
| Read positions + transactions | 2-3 weeks | Low — Apex is the broker of record |
| Place orders | +4-6 weeks | High — needs Harbour's FMA licence wrap, suitability check, disclosure flow |

Recommend shipping read-only first.

---

## Forms by Air

### What we receive

A single webhook per form submission. Today the schema we handle:

```json
{
  "form_id": "investiq-onboarding-v1",
  "submission_id": "fba_abc123",
  "submitted_at": "2026-05-19T10:30:00Z",
  "submitter_email": "user@example.com",
  "fields": {
    "full_name": "...", "preferred_name": "...",
    "date_of_birth": "...", "nzbn_or_ird": "...",
    "phone": "...", "tax_residency": "NZ",
    "pep_status": false, "sanctions_check_consent": true,
    "risk_q1_horizon": 5, "risk_q2_volatility_comfort": 4,
    "risk_q3_loss_tolerance": 3, "risk_q4_income_dependence": 4,
    "risk_q5_experience": 4, "computed_risk_profile": "Growth",
    "primary_goal": "Retirement",
    "target_amount": 1500000, "target_date": "2050-01-01",
    "monthly_contribution": 2000,
    "terms_accepted": true, "privacy_policy_accepted": true,
    "marketing_optin": false
  }
}
```

### Field mapping (form → InvestIQ tables)

| Form field | InvestIQ destination |
|---|---|
| `preferred_name` | `profiles.display_name` |
| `tax_residency` | `profiles.country` |
| `computed_risk_profile` | `profiles.risk_profile` (new column) |
| `phone` | `profiles.phone` (new column) |
| `pep_status` | `profiles.pep_flagged` (new column) |
| `primary_goal` + `target_amount` + `target_date` + `monthly_contribution` | `investment_goals` row (auto-created via migration 015) |
| `terms_accepted` + `privacy_policy_accepted` | `profiles.tcs_accepted_at` (new column) — required for legal sign-off audit |

### Today's behaviour (demo)

- **Admin Panel → Test Onboarding Webhook** simulates a submission
  with realistic data.
- The proxy `/api/integrations/forms-webhook` receives, returns a
  `202 preview_accepted` echoing the field mapping it would apply.
- Demonstrable end-to-end without a real Forms by Air subscription.

### To enable real webhooks

1. Sign up for Forms by Air, create a form using their templates +
   add custom risk-profiling questions.
2. Set the webhook URL to `{PROXY}/api/integrations/forms-webhook`.
3. Set the webhook secret as `FORMSBYAIR_WEBHOOK_SECRET` env var on
   Render — proxy validates the HMAC signature on every call.
4. Update `_proxy_forms_webhook` to replace the preview-mode return
   with a real Supabase upsert into `profiles` + insert into
   `investment_goals` via the service-role key.
5. Trigger an automatic Dynamics Lead → Contact conversion once the
   webhook lands (via Supabase trigger or Edge Function).

**Estimate to production:** 3-5 days once the Forms by Air account
is set up.

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
