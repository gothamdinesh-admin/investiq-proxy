# Restoring from a daily backup

The `daily-backup` Edge Function produces a JSON dump in the private `backups`
Storage bucket every day at 14:00 UTC. Each file is named `backup-YYYY-MM-DD.json`
and contains the row-level state of every critical table.

## When you'd need this

- Accidental `DELETE FROM ...` / `TRUNCATE` against production
- Bad migration that corrupted a table
- Supabase project deletion / cluster loss (rare)
- One specific user's data needs rolling back

## What the JSON contains

```json
{
  "meta": {
    "backup_version": 1,
    "timestamp": "2026-05-16T14:00:00.000Z",
    "source": "https://szyclmouetbbigxexdrn.supabase.co",
    "retention_days": 30,
    "tables": ["profiles", "families", "family_members", ...]
  },
  "data": {
    "profiles":          [ { id, email, is_admin, ... }, ... ],
    "families":          [ { id, name, created_by, ... }, ... ],
    "family_members":    [ ... ],
    "family_invites":    [ ... ],
    "investiq_portfolios":   [ ... ],
    "investiq_snapshots":    [ ... ],
    "investiq_activity_log": [ ... ],
    "price_alerts":      [ ... ]
  }
}
```

Note: only **data** is captured, not **schema**. Schema lives in
`supabase/migrations/*.sql`, version-controlled in git. To restore a totally
lost project: first run migrations 001-011+ in order, THEN apply the data dump.

## Download a backup

1. Supabase Dashboard → Storage → `backups` bucket
2. Find the date you want (e.g. `backup-2026-05-16.json`)
3. Click → Download

Or via SQL Editor:
```sql
SELECT storage.create_signed_url('backups', 'backup-2026-05-16.json', 60);
```
Returns a signed URL valid for 60 seconds. `curl -O` it.

## Restore options (in order of how surgical)

### Option A — One specific user, one specific table

Open the JSON in a text editor. Find the row(s) you want. Run an INSERT or
UPDATE in SQL Editor manually. Best for "Bob's portfolio got wiped, just
restore Bob's row".

```sql
-- Example: restore one user's investiq_portfolios row
INSERT INTO investiq_portfolios (user_id, portfolio, settings, agent_results, updated_at)
VALUES (
  'd4a4a651-7930-4e45-83fa-a3cec0bbd811',
  '[{"id": "...", "symbol": "NVDA", ...}]'::jsonb,
  '{"name": "My Portfolio", ...}'::jsonb,
  null,
  '2026-05-16T14:00:00Z'
)
ON CONFLICT (user_id) DO UPDATE SET
  portfolio = EXCLUDED.portfolio,
  settings = EXCLUDED.settings,
  updated_at = EXCLUDED.updated_at;
```

### Option B — Whole table restore (e.g. someone DROPped one)

1. Re-run the table's `CREATE TABLE` SQL from the relevant migration in
   `supabase/migrations/`
2. Re-run the RLS policies (in the same migration)
3. Bulk insert from JSON. Easiest path: use psql or a Python script:

```python
# scripts/restore_table.py (sketch)
import json, requests
with open('backup-2026-05-16.json') as f:
    dump = json.load(f)
rows = dump['data']['investiq_portfolios']
# Use supabase-py with service role to insert in batches of 500
```

### Option C — Full project disaster recovery

Worst case scenario — Supabase project gone or corrupted beyond use.

1. Create a new Supabase project
2. Run all migrations 001-onwards in SQL Editor in order
3. Restore each table from the most recent backup JSON via Python script
   (loop over `dump.data[tableName]`, batch insert 500 rows at a time)
4. Update `PLATFORM_CONFIG.supabaseUrl` and `supabaseKey` in `00-config.js`
5. Re-deploy frontend
6. Re-deploy all Edge Functions
7. Re-run all setup.sql files for cron schedules
8. Reset auth.users — users will need to re-sign up. There is NO export
   of auth.users in this backup (Supabase Auth is a separate sub-service).

**For auth.users recovery**, you'd need Supabase's own auth export feature
(only available on Team plan and above) or accept that users re-sign-up.

## Testing the restore procedure

**Strongly recommended:** once a quarter, do a test restore:

1. Create a free-tier Supabase project as a staging environment
2. Run all migrations there
3. Pull yesterday's `backup-*.json`
4. Run option B for one table
5. Confirm data shape is intact

This proves your backup actually works. Backups you've never tested
are not backups — they're filenames in a bucket.

## What's NOT backed up (by design)

- `auth.users` — Supabase Auth's own table, separate sub-service
- `pg_cron.job` — cron schedules (re-run setup.sql files)
- Edge Function source — lives in `supabase/functions/` in git
- Supabase Vault entries (none used yet — when secrets move there, document separately)
- Storage bucket contents (currently only the backups themselves — chicken-and-egg)

Schema is in git (`supabase/migrations/`). Code is in git. Data is in
the backup. Secrets are in dashboards + password manager. Together,
recovery is always possible.
