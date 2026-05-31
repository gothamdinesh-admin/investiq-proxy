-- ════════════════════════════════════════════════════════════════════════
-- 016_multi_portfolio.sql — Multi-portfolio support (v0.21a)
--
-- Adds two ADDITIVE columns to investiq_portfolios. Non-destructive and
-- idempotent — safe to re-run. The existing `portfolio` column is RETAINED
-- and kept populated with the ACTIVE portfolio's holdings, so the 4 Edge
-- Functions (weekly-digest, check-price-alerts, refresh-nz-funds,
-- daily-backup) and the snapshot path keep working unchanged.
--
--   portfolios          jsonb  — [{ id, name, holdings:[...] }]  (source of truth)
--   active_portfolio_id text   — which portfolio is active
--
-- RLS is unchanged: still one row per user, still user_id = auth.uid().
-- No new table, no new policy needed.
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE public.investiq_portfolios
  ADD COLUMN IF NOT EXISTS portfolios jsonb;

ALTER TABLE public.investiq_portfolios
  ADD COLUMN IF NOT EXISTS active_portfolio_id text;

-- Backfill: for any existing row that has holdings in the legacy `portfolio`
-- column but no `portfolios` envelope yet, wrap them into a single "Personal"
-- portfolio. Idempotent — only touches rows where portfolios IS NULL.
UPDATE public.investiq_portfolios
SET
  portfolios = jsonb_build_array(
    jsonb_build_object(
      'id', 'default',
      'name', 'Personal',
      'holdings', COALESCE(portfolio, '[]'::jsonb)
    )
  ),
  active_portfolio_id = 'default'
WHERE portfolios IS NULL;

-- Sanity check (run manually after): every row should now have a portfolios array.
-- SELECT user_id, jsonb_array_length(portfolios) AS n_portfolios, active_portfolio_id
-- FROM public.investiq_portfolios;
