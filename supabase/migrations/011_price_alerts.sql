-- ═══════════════════════════════════════════════════════════════════════
-- v0.7c — Price Alerts foundation
--
-- User-defined triggers: "Email me when NVDA drops below $200" or
-- "Email me when my portfolio drops > 5% in a single day".
--
-- Backed by a scheduled Edge Function (check-price-alerts) that runs
-- every 30 min, evaluates active alerts, and emails via Resend.
-- Cooldown prevents alert spam — same alert can fire at most once per
-- cooldown_hours (default 24h).
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS price_alerts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Scope: a specific ticker OR the user's whole portfolio
  scope           TEXT NOT NULL CHECK (scope IN ('ticker', 'portfolio')),
  symbol          TEXT,                 -- required if scope='ticker'

  -- Condition + threshold:
  --   'above'         — price/value RISES above threshold
  --   'below'         — price/value FALLS below threshold
  --   'day_rise_pct'  — single-day % gain >= threshold
  --   'day_drop_pct'  — single-day % loss >= threshold (positive number)
  condition       TEXT NOT NULL CHECK (condition IN ('above', 'below', 'day_rise_pct', 'day_drop_pct')),
  threshold       NUMERIC NOT NULL,
  currency        TEXT,                 -- 'USD' / 'NZD' / native — what threshold is in

  -- Lifecycle
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  last_fired_at   TIMESTAMPTZ,
  fire_count      INTEGER NOT NULL DEFAULT 0,
  cooldown_hours  INTEGER NOT NULL DEFAULT 24 CHECK (cooldown_hours >= 1 AND cooldown_hours <= 720),
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Defaults default the column to auth.uid() so client can omit it
  CONSTRAINT scope_requires_symbol CHECK (scope <> 'ticker' OR symbol IS NOT NULL)
);

ALTER TABLE price_alerts ALTER COLUMN user_id SET DEFAULT auth.uid();

CREATE INDEX IF NOT EXISTS price_alerts_user_idx       ON price_alerts(user_id);
CREATE INDEX IF NOT EXISTS price_alerts_active_idx     ON price_alerts(active) WHERE active = TRUE;
CREATE INDEX IF NOT EXISTS price_alerts_symbol_idx     ON price_alerts(symbol) WHERE symbol IS NOT NULL AND active = TRUE;

-- RLS — users own their own alerts. Family adults DON'T see kids' alerts
-- (alerts feel more personal than holdings; revisit if anyone asks).
ALTER TABLE price_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS price_alerts_select ON price_alerts;
DROP POLICY IF EXISTS price_alerts_insert ON price_alerts;
DROP POLICY IF EXISTS price_alerts_update ON price_alerts;
DROP POLICY IF EXISTS price_alerts_delete ON price_alerts;

CREATE POLICY price_alerts_select ON price_alerts FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY price_alerts_insert ON price_alerts FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY price_alerts_update ON price_alerts FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY price_alerts_delete ON price_alerts FOR DELETE
  USING (user_id = auth.uid());

-- Verification:
-- a) Table exists:
--    SELECT table_name FROM information_schema.tables WHERE table_name = 'price_alerts';
-- b) Test row insert (replace with your user_id if not signed in):
--    INSERT INTO price_alerts (scope, symbol, condition, threshold, currency)
--      VALUES ('ticker', 'NVDA', 'below', 150, 'USD');
-- c) See your own alerts:
--    SELECT * FROM price_alerts WHERE user_id = auth.uid();
