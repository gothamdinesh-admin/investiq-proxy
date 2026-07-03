# Account Deletion Runbook (Privacy Act 2020)

_Admin procedure for a user's deletion request. Target: complete within
10 working days of the request (we promise this in the in-app Privacy Notice).
Applies to both projects — run in the edition the user belongs to._

## 1. Identify the user
- Supabase Dashboard → Authentication → Users → search email → copy the **UUID**.
- Or in-app: Admin → Users (shows email; the UUID is in the auth dashboard).

## 2. Revoke access immediately
- In-app Admin → the user's row → **Revoke** (clears `is_approved` + proxy secret).

## 3. Delete their data (SQL Editor)
Paste this with the UUID substituted. It removes every row the user owns,
children before parents. Idempotent — safe to re-run.

```sql
-- ⚠ REPLACE with the user's auth UUID before running:
-- select id, email from auth.users where email = 'user@example.com';
do $$
declare uid uuid := '00000000-0000-0000-0000-000000000000';
begin
  -- Family structures they created (members/invites of those families first)
  delete from public.family_invites  where family_id in (select id from public.families where created_by = uid);
  delete from public.family_members  where family_id in (select id from public.families where created_by = uid);
  delete from public.families        where created_by = uid;
  -- Their memberships/invites elsewhere
  delete from public.family_members  where user_id = uid;
  update public.family_invites set used_by = null   where used_by = uid;
  delete from public.family_invites  where invited_by = uid;
  -- Per-user data
  delete from public.trades              where user_id = uid;
  delete from public.trade_setups        where user_id = uid;
  delete from public.investment_goals    where user_id = uid;
  delete from public.price_alerts        where user_id = uid;
  delete from public.notifications       where user_id = uid;
  delete from public.dividends           where user_id = uid;
  delete from public.investiq_snapshots  where user_id = uid;
  delete from public.investiq_portfolios where user_id = uid;
  delete from public.investiq_activity_log where user_id = uid;
  -- Profile last (other tables may reference it).
  -- cms_content.updated_by has ON DELETE SET NULL semantics via auth.users — no action needed here.
  delete from public.profiles            where id = uid;
end $$;
```

> Note: `cms_content.updated_by` and `daily-backup` dumps reference users with
> `ON DELETE SET NULL` / by snapshot — see step 5 for backups.

## 4. Delete the auth account
- Dashboard → Authentication → Users → the user → **Delete user**.
  (Do this AFTER step 3 — some FKs would otherwise block or orphan rows.)

## 5. Backups & third parties
- **Storage `backups` bucket**: daily JSON dumps contain the user's rows for up
  to 30 days. Either wait out the retention (document the request date) or
  delete the dump files covering their data if the user insists on immediate
  erasure.
- **Resend**: transactional email logs age out automatically (no action).
- **Sentry**: contains no account data (errors only); no action.
- **Anthropic**: receives holdings names/weights only, no identifiers; no action.

## 6. Confirm
- Reply to the user confirming deletion and the backup-expiry date.
- Log it: keep the request email + completion date (deletion of the activity
  log means the app itself won't have a record — the email thread is the record).
