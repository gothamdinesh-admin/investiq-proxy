-- ═══════════════════════════════════════════════════════════════════════
-- check-price-alerts — schedule
-- Run once in Supabase SQL Editor AFTER deploying the Edge Function and
-- setting the secrets.
-- ═══════════════════════════════════════════════════════════════════════

-- Required Edge Function secrets (set via Dashboard → Project Settings →
-- Edge Functions → Add new secret):
--   RESEND_API_KEY        (reuse from weekly-digest)
--   RESEND_FROM_EMAIL     (reuse)
--   CRON_SECRET           (reuse — same value as the cron job uses below)
--   PROXY_URL             https://investiq-proxy.onrender.com
--   PROXY_SECRET          (the same 32-char value set on Render — so the
--                          function can hit /api/market with auth)

-- Unschedule any previous version (idempotent re-run)
SELECT cron.unschedule('investiq-price-alerts')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'investiq-price-alerts');

-- Replace BOTH placeholders:
--   <YOUR_SUPABASE_ANON_KEY>  — same key already in PLATFORM_CONFIG.supabaseKey
--   <YOUR_CRON_SECRET_HERE>   — the same value used by weekly-digest

-- Every 30 minutes. Adjust freq as needed; 30 min keeps Resend usage low and
-- catches most fast moves. Bumping to 10 min adds spam risk; cooldown_hours
-- on each alert is the per-alert safety so it's fine either way.
SELECT cron.schedule(
  'investiq-price-alerts',
  '*/30 * * * *',
  $$
    SELECT net.http_post(
      url     := 'https://szyclmouetbbigxexdrn.supabase.co/functions/v1/check-price-alerts',
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
--    SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'investiq-price-alerts';
-- b) See recent runs (after the first 30 min):
--    SELECT start_time, status, return_message FROM cron.job_run_details
--      WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'investiq-price-alerts')
--      ORDER BY start_time DESC LIMIT 10;
-- c) Manual trigger to test now (paste your CRON_SECRET):
--    curl -X POST https://szyclmouetbbigxexdrn.supabase.co/functions/v1/check-price-alerts \
--         -H 'Authorization: Bearer <SUPABASE_ANON_KEY>' \
--         -H 'X-Cron-Secret: <CRON_SECRET>' \
--         -H 'Content-Type: application/json' \
--         -d '{}'

-- To turn it off:
-- SELECT cron.unschedule('investiq-price-alerts');
