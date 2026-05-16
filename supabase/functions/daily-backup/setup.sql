-- ═══════════════════════════════════════════════════════════════════════
-- daily-backup — schedule
-- Run once in Supabase SQL Editor AFTER deploying the Edge Function.
-- ═══════════════════════════════════════════════════════════════════════

-- Required Edge Function secrets (Dashboard → Project Settings → Edge
-- Functions → Secrets — reuse existing values where listed):
--   CRON_SECRET   (reuse the existing one)
--   SUPABASE_URL                (auto-injected)
--   SUPABASE_SERVICE_ROLE_KEY   (auto-injected)
-- No new secrets needed for backup if you already set up digest/alerts.

-- Unschedule any previous version (idempotent)
SELECT cron.unschedule('investiq-daily-backup')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'investiq-daily-backup');

-- Daily at 14:00 UTC = 2 AM NZ time (low-traffic window).
-- Replace BOTH placeholders before running:
SELECT cron.schedule(
  'investiq-daily-backup',
  '0 14 * * *',
  $$
    SELECT net.http_post(
      url     := 'https://szyclmouetbbigxexdrn.supabase.co/functions/v1/daily-backup',
      headers := jsonb_build_object(
        'Authorization', 'Bearer <YOUR_SUPABASE_ANON_KEY>',
        'X-Cron-Secret', '<YOUR_CRON_SECRET_HERE>',
        'Content-Type',  'application/json'
      ),
      body    := '{}'::jsonb
    )
  $$
);

-- Verification:
-- a) Confirm job scheduled:
--    SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'investiq-daily-backup';
-- b) Manual trigger to test now (paste your CRON_SECRET):
--    curl -X POST https://szyclmouetbbigxexdrn.supabase.co/functions/v1/daily-backup \
--         -H 'Authorization: Bearer <SUPABASE_ANON_KEY>' \
--         -H 'X-Cron-Secret: <CRON_SECRET>' \
--         -H 'Content-Type: application/json' \
--         -d '{}'
-- c) View backups in the Storage bucket:
--    Supabase Dashboard → Storage → 'backups' bucket → list files
--    Files named backup-YYYY-MM-DD.json. Older than 30 days auto-deleted.

-- To turn off:
-- SELECT cron.unschedule('investiq-daily-backup');
