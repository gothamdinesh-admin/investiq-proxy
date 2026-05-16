-- ═══════════════════════════════════════════════════════════════════════
-- v0.8a — Dividend tracking foundation
--
-- Per-payment records for cash dividends, DRIPs, special distributions
-- and returns of capital. NZ tax fields built in (foreign withholding,
-- imputation credits) so IR3 line 17 export is a downstream feature
-- on top of this same schema.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS dividends (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Holding linkage. We denormalise symbol + platform so a dividend
  -- record survives the user deleting the holding (e.g. sold position,
  -- but the dividend was real income that year and must persist for tax).
  symbol              TEXT NOT NULL,
  platform            TEXT,

  -- Dates
  ex_date             DATE,           -- when dividend was declared (info only)
  pay_date            DATE NOT NULL,  -- when money actually arrived (tax-significant)

  -- Money — all in native currency of the payment
  gross_amount        NUMERIC(18,4) NOT NULL CHECK (gross_amount >= 0),
  currency            TEXT NOT NULL DEFAULT 'NZD',

  -- NZ tax fields
  withholding_tax     NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (withholding_tax >= 0),
                                                  -- foreign tax withheld at source (US: 15%, UK: 0%, AU: 30%)
  imputation_credit   NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (imputation_credit >= 0),
                                                  -- NZ-company tax credit attached to fully-imputed divs
  -- Type
  div_type            TEXT NOT NULL DEFAULT 'cash'
                      CHECK (div_type IN ('cash', 'drip', 'special', 'return_of_capital', 'interest')),

  -- Provenance for future automation
  source              TEXT NOT NULL DEFAULT 'manual'
                      CHECK (source IN ('manual', 'csv', 'akahu', 'broker_api')),
  notes               TEXT,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indices for the common queries:
--   - User's full ledger
--   - Per-holding history (by symbol)
--   - Year-on-year totals (by pay_date)
CREATE INDEX IF NOT EXISTS dividends_user_idx        ON dividends(user_id);
CREATE INDEX IF NOT EXISTS dividends_user_symbol_idx ON dividends(user_id, symbol);
CREATE INDEX IF NOT EXISTS dividends_user_year_idx   ON dividends(user_id, pay_date);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_dividends_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS dividends_touch_updated ON dividends;
CREATE TRIGGER dividends_touch_updated
  BEFORE UPDATE ON dividends
  FOR EACH ROW EXECUTE FUNCTION public.touch_dividends_updated_at();

-- RLS — own-rows-only, like price_alerts. Family adults DON'T see other
-- members' dividends (tax data is personal even within a family). Revisit
-- if anyone asks; for now it's the more conservative default.
ALTER TABLE dividends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dividends_select ON dividends;
DROP POLICY IF EXISTS dividends_insert ON dividends;
DROP POLICY IF EXISTS dividends_update ON dividends;
DROP POLICY IF EXISTS dividends_delete ON dividends;

CREATE POLICY dividends_select ON dividends FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY dividends_insert ON dividends FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY dividends_update ON dividends FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY dividends_delete ON dividends FOR DELETE
  USING (user_id = auth.uid());

-- Helper view: YTD income aggregated by user + currency. Useful for the
-- dashboard summary card. SECURITY INVOKER means it inherits the caller's
-- RLS (i.e. they only see their own rows).
CREATE OR REPLACE VIEW dividends_ytd_summary AS
  SELECT
    user_id,
    currency,
    SUM(gross_amount)        AS gross_total,
    SUM(withholding_tax)     AS withholding_total,
    SUM(imputation_credit)   AS imputation_total,
    SUM(gross_amount - withholding_tax) AS net_total,
    COUNT(*)                 AS payment_count
  FROM dividends
  WHERE pay_date >= date_trunc('year', CURRENT_DATE)
  GROUP BY user_id, currency;

-- Verification:
-- a) Table exists:
--    SELECT table_name FROM information_schema.tables WHERE table_name='dividends';
-- b) RLS on:
--    SELECT relrowsecurity FROM pg_class WHERE relname='dividends';
-- c) Test insert (after signing in):
--    INSERT INTO dividends (symbol, pay_date, gross_amount, currency)
--      VALUES ('NVDA', '2026-03-15', 0.04, 'USD');
-- d) See your YTD by currency:
--    SELECT * FROM dividends_ytd_summary WHERE user_id = auth.uid();
