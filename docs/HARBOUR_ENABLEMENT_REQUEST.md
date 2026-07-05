# Harbour IQ — Enablement request (IT + Compliance/Risk)

_Draft for DK to adapt and forward. One shared context section, then the
specific asks for each team. Written to be copy-pasteable into email._

---

## Context (for both teams)

**What it is.** Harbour IQ is a working prototype of a Harbour-branded investor
dashboard. Two layers:
1. **Fund information** (already built) — for each Harbour fund: holdings/
   composition (from the public NZ Disclose Register), unit price, monthly and
   period returns, the official monthly fund reports, and a house-wide risk
   view. This uses public + internal-but-low-sensitivity data.
2. **Client holdings** (in design) — an individual investor's units/value across
   Harbour funds, sourced from the **APEX registry account feed**. Harbour would
   provision each client (they log in and see their own holdings — they enter
   nothing).

**Why now.** The fund layer is demo-ready. Before we connect **real client data**
(names, IRD numbers, balances) we need the platform to sit on Harbour-owned
infrastructure and to clear Harbour's data-governance/compliance process. Those
are the long-lead items, so we're raising them early while UI work continues on
dummy data.

**Current state (important).** The prototype currently runs on the developer's
personal cloud accounts (Netlify, Render, Supabase, Anthropic). No real client
data has been loaded — testing uses fabricated/dummy records only. It will stay
that way until the items below are in place.

**Approval.** The concept has been supported by Harbour leadership as an internal
trial.

---

## Ask 1 — IT / Infrastructure

To move from prototype to something that can hold Harbour data, we need the
platform on **Harbour-owned (or Harbour-contracted) infrastructure**:

1. **Database & auth** — a Harbour-owned **Supabase** organisation/project (or an
   equivalent Postgres + auth service Harbour controls). Data is encrypted at
   rest and in transit; access is row-level scoped per user.
2. **Hosting** — a Harbour-owned static hosting + a small API service (currently
   Netlify + Render), or hosting on Harbour's existing stack.
3. **AI processing** — a Harbour-owned Anthropic (Claude) API account for the
   analysis features. Only fund holdings names/weights are sent — never client
   identifiers.
4. **Domain** — a Harbour subdomain, e.g. `iq.harbourasset.co.nz`, with the DNS
   records needed for hosting + transactional email (SPF/DKIM).
5. **APEX account feed** — the piece that makes the client layer real: a
   **repeatable export (or API) of the APEX account-holdings feed**, keyed by the
   **unique account id**, so a Harbour IQ login can be matched to its APEX
   account. Today this is the monthly `Account upload` workbook; ideally a
   scheduled feed. Please advise the cleanest supported way to obtain it.
6. **Azure AD app (later)** — if we automate ingestion from SharePoint/OneDrive,
   an Azure AD app registration scoped to the relevant library.

Rough shape once infra is Harbour-owned: two tables (`client_accounts`,
`client_holdings`) keyed by the APEX account id, with row-level security so a
client sees only their own account and staff see all. Bulk ingestion runs
server-side so client PII is never handled in the browser.

---

## Ask 2 — Compliance / Risk (and FMA obligations)

Harbour IQ will hold **NZ investors' personal and financial information**
(names, IRD numbers, PIR, holdings, balances). We need Compliance/Risk to own
the governance sign-off before real data is connected. Specifically:

1. **Data-governance / privacy review** under the **Privacy Act 2020** — we have
   an in-app privacy notice and a deletion runbook drafted; we need review and a
   data map / retention position confirmed. Sub-processors today: Supabase,
   Netlify, Render, Anthropic, Resend, Sentry (all to move under Harbour-owned
   accounts per Ask 1).
2. **Outsourcing & technology-systems assessment** — confirm how a client-facing
   tool holding investor records fits Harbour's **FMC licence obligations**
   (outsourcing register, operational resilience, technology risk). Is this in
   scope as a system-of-record, or read-only reporting only?
3. **Assurance target** — advise which assurance Harbour expects before go-live:
   **SOC 2** (Type I → Type II), **ISO/IEC 27001**, and/or reliance on **APEX's
   ISAE 3402 / SOC 1** for the record-keeping chain. This sets the control bar we
   build to.
4. **Access model sign-off** — staff (see all) vs client (see own only), audit
   logging of who views which client, and the provisioning process (how a client
   login is authorised and linked to an APEX account).

---

## What we're NOT asking for yet
No production launch, no real client data, no public marketing. This is to
green-light the **foundations** (owned infra + governance) so that when they're
ready, connecting real data is a short, controlled step rather than a scramble.

**Point of contact:** DK Dineshkumar.
