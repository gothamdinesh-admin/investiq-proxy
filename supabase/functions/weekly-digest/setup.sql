-- ═══════════════════════════════════════════════════════════════════════
-- weekly-digest — one-time Supabase setup
-- Project ref: szyclmouetbbigxexdrn (already filled in below)
-- Run this in Supabase Dashboard → SQL Editor *once* after deploying the
-- Edge Function with `supabase functions deploy weekly-digest`.
-- ═══════════════════════════════════════════════════════════════════════

-- 1. Add opt-in columns on profiles. Safe to re-run.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS digest_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS digest_last_sent TIMESTAMPTZ;

-- 2. Enable required Postgres extensions (Supabase Pro unlocks these).
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 3. CRON_SECRET — used by the cron job to authenticate to the Edge Function.
-- Generate locally first:
--     PowerShell: -join ((48..57)+(97..122) | Get-Random -Count 64 | %{[char]$_})
--     macOS/Linux: openssl rand -hex 32
-- We can't ALTER DATABASE … SET in hosted Supabase (permission denied), so
-- the value is embedded directly in the cron job body below. This is
-- equivalent security: both methods require admin DB access to read.
-- Same value MUST also be set as the CRON_SECRET Edge Function secret
-- (Dashboard → Project Settings → Edge Functions → Add new secret).
--
-- *** Local-only file — do NOT git-commit a copy with your real secret. ***

-- 4. Schedule weekly run — 6 AM Monday NZ = 18:00 UTC Sunday.
-- Unschedule any previous version first so re-running this file is idempotent.
SELECT cron.unschedule('investiq-weekly-digest')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'investiq-weekly-digest');

SELECT cron.schedule(
  'investiq-weekly-digest',
  '0 18 * * 0',  -- minute hour DoM month DoW (UTC)
  $$
    SELECT net.http_post(
      url     := 'https://szyclmouetbbigxexdrn.supabase.co/functions/v1/weekly-digest',
      headers := jsonb_build_object(
        'Authorization', 'Bearer <YOUR_CRON_SECRET_HERE>',
        'Content-Type',  'application/json'
      ),
      body    := '{}'::jsonb
    )
  $$
);

-- ═══ Verification queries ═══════════════════════════════════════════════
-- After running the above, sanity-check:

-- a. Confirm the cron job is scheduled:
-- SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'investiq-weekly-digest';

-- b. Confirm your opt-in flag is set (replace with your email):
-- SELECT email, digest_opt_in FROM profiles WHERE email = 'gothamdinesh@gmail.com';

-- c. View recent cron runs (after Sunday — Sunday-noon-ish if you set things
--    up before then, otherwise wait):
-- SELECT * FROM cron.job_run_details
--   WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'investiq-weekly-digest')
--   ORDER BY start_time DESC LIMIT 10;

-- ═══ To turn it off ═════════════════════════════════════════════════════
-- SELECT cron.unschedule('investiq-weekly-digest');
