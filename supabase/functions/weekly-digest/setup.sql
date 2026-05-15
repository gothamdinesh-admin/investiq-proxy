-- ═══════════════════════════════════════════════════════════════════════
-- weekly-digest — one-time Supabase setup
-- Run this in Supabase Dashboard → SQL Editor *once* after deploying the
-- Edge Function with `supabase functions deploy weekly-digest`.
-- ═══════════════════════════════════════════════════════════════════════

-- 1. Add the opt-in column on profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS digest_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS digest_last_sent TIMESTAMPTZ;

-- 2. Enable required Postgres extensions (Supabase Pro unlocks these)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 3. Store the CRON_SECRET so the cron job can authenticate to the Edge
-- Function. Generate a random one and replace <YOUR_CRON_SECRET> below.
-- Also set it as a Supabase Function secret:
--   supabase secrets set CRON_SECRET=<YOUR_CRON_SECRET>
ALTER DATABASE postgres SET app.cron_secret = '<YOUR_CRON_SECRET>';

-- 4. Schedule weekly run — 6 AM Monday NZ time = 18:00 UTC Sunday
SELECT cron.schedule(
  'investiq-weekly-digest',
  '0 18 * * 0',  -- minute hour DoM month DoW (UTC)
  $$
    SELECT net.http_post(
      url     := 'https://<YOUR_PROJECT>.supabase.co/functions/v1/weekly-digest',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.cron_secret'),
        'Content-Type',  'application/json'
      ),
      body    := '{}'::jsonb
    )
  $$
);

-- To verify or unschedule later:
-- SELECT * FROM cron.job;                     -- list all
-- SELECT cron.unschedule('investiq-weekly-digest');
