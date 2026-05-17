-- ═══════════════════════════════════════════════════════════════════════
-- refresh-nz-funds — schedule
-- Run once in Supabase SQL Editor AFTER deploying the Edge Function.
-- ═══════════════════════════════════════════════════════════════════════

-- Required Edge Function secrets (Dashboard → Project Settings → Edge
-- Functions → Secrets — reuse existing values):
--   CRON_SECRET                 (reuse existing)
--   PROXY_URL                   (reuse existing — set during check-price-alerts setup)
--   PROXY_SECRET                (reuse existing)
--   SUPABASE_URL                (auto-injected)
--   SUPABASE_SERVICE_ROLE_KEY   (auto-injected)
-- No new secrets needed if you already set up price-alerts / digest.

-- Unschedule any previous version (idempotent)
SELECT cron.unschedule('investiq-refresh-funds')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'investiq-refresh-funds');

-- Daily at 14:00 UTC = 2 AM NZ time (low-traffic window).
-- Replace BOTH placeholders before running:
SELECT cron.schedule(
  'investiq-refresh-funds',
  '0 14 * * *',
  $$
    SELECT net.http_post(
      url     := 'https://szyclmouetbbigxexdrn.supabase.co/functions/v1/refresh-nz-funds',
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
--    SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'investiq-refresh-funds';
-- b) Manual trigger to test now (paste your CRON_SECRET via SQL since shell is fiddly):
--    SELECT net.http_post(
--      url     := 'https://szyclmouetbbigxexdrn.supabase.co/functions/v1/refresh-nz-funds',
--      headers := jsonb_build_object(
--        'Authorization', 'Bearer <YOUR_SUPABASE_ANON_KEY>',
--        'X-Cron-Secret', '<YOUR_CRON_SECRET_HERE>',
--        'Content-Type',  'application/json'
--      ),
--      body    := '{}'::jsonb
--    );
--    Then check the response:
--    SELECT status_code, content::json FROM net._http_response ORDER BY created DESC LIMIT 1;

-- To turn off:
-- SELECT cron.unschedule('investiq-refresh-funds');
