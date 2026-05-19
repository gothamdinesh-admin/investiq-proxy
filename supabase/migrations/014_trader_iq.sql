-- ═══════════════════════════════════════════════════════════════════════
-- 014 — TraderIQ schema (v0.13)
--
-- TraderIQ is the sibling app to InvestIQ — same login, same Supabase
-- project, different worldview. Where InvestIQ tracks long-term HOLDINGS
-- (still in your portfolio), TraderIQ tracks TRADES (a position you took
-- and exited, or are planning to take). Different P&L lens, different
-- mental model, different UI.
--
-- Tables:
--   trades         — every closed trade (or open intent) with thesis
--                    + lesson + setup tag + entry/exit prices
--   trade_setups   — user-defined setup categories (Breakout, Mean
--                    Reversion, News Catalyst, etc) for tagging trades
--
-- RLS: own-rows-only across the board. No family sharing yet — trader
-- journals are private by default; can layer sharing later if needed.
-- ═══════════════════════════════════════════════════════════════════════

-- ── trade_setups (user-defined tag library) ─────────────────────────────
CREATE TABLE IF NOT EXISTS trade_setups (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  color         TEXT,         -- hex or CSS var name for chip colour
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS trade_setups_user_idx ON trade_setups(user_id, created_at DESC);

ALTER TABLE trade_setups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS trade_setups_select ON trade_setups;
DROP POLICY IF EXISTS trade_setups_insert ON trade_setups;
DROP POLICY IF EXISTS trade_setups_update ON trade_setups;
DROP POLICY IF EXISTS trade_setups_delete ON trade_setups;

CREATE POLICY trade_setups_select ON trade_setups FOR SELECT USING (user_id = auth.uid());
CREATE POLICY trade_setups_insert ON trade_setups FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY trade_setups_update ON trade_setups FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY trade_setups_delete ON trade_setups FOR DELETE USING (user_id = auth.uid());

-- ── trades (main journal table) ─────────────────────────────────────────
-- status: 'planned' | 'open' | 'closed' | 'cancelled'
-- side:   'long' | 'short' (short = inverse direction, optional)
-- pnl/pnl_pct: computed client-side and stored for easy querying;
--              recomputed on any update.
CREATE TABLE IF NOT EXISTS trades (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol          TEXT NOT NULL,
  name            TEXT,
  asset_type      TEXT NOT NULL DEFAULT 'stock' CHECK (asset_type IN ('stock','etf','crypto','fx','option','other')),
  side            TEXT NOT NULL DEFAULT 'long'  CHECK (side IN ('long','short')),
  status          TEXT NOT NULL DEFAULT 'closed' CHECK (status IN ('planned','open','closed','cancelled')),

  -- Setup tag (free text + optional FK to user's library)
  setup_id        UUID REFERENCES trade_setups(id) ON DELETE SET NULL,
  setup_label     TEXT,        -- denormalised so the chip survives if setup deleted

  -- Entry leg
  entry_date      TIMESTAMPTZ,
  entry_price     NUMERIC(20,8),
  entry_qty       NUMERIC(20,8),
  entry_currency  TEXT,        -- e.g. 'USD'; converted to base via FX
  entry_fx_rate   NUMERIC(20,8),

  -- Exit leg (nullable while planned/open)
  exit_date       TIMESTAMPTZ,
  exit_price      NUMERIC(20,8),
  exit_qty        NUMERIC(20,8),

  -- Risk/plan fields (captured pre-trade in the Workbench)
  stop_price      NUMERIC(20,8),
  target_price    NUMERIC(20,8),
  position_size_pct NUMERIC(8,4), -- % of portfolio at entry
  risk_reward     NUMERIC(8,2),   -- e.g. 2.5 means 2.5R reward potential

  -- Narrative
  thesis          TEXT,          -- why you took the trade
  lesson          TEXT,           -- what you learned after closing
  tags            TEXT[],         -- arbitrary user tags

  -- Computed P&L (in user's base currency)
  pnl             NUMERIC(20,2),
  pnl_pct         NUMERIC(10,4),
  duration_hours  NUMERIC(12,2),

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS trades_user_idx       ON trades(user_id, entry_date DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS trades_user_status    ON trades(user_id, status);
CREATE INDEX IF NOT EXISTS trades_user_symbol    ON trades(user_id, symbol);

-- Auto-update updated_at on UPDATE
CREATE OR REPLACE FUNCTION _trades_touch() RETURNS trigger AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trades_touch ON trades;
CREATE TRIGGER trades_touch BEFORE UPDATE ON trades
  FOR EACH ROW EXECUTE FUNCTION _trades_touch();

ALTER TABLE trades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS trades_select ON trades;
DROP POLICY IF EXISTS trades_insert ON trades;
DROP POLICY IF EXISTS trades_update ON trades;
DROP POLICY IF EXISTS trades_delete ON trades;

CREATE POLICY trades_select ON trades FOR SELECT USING (user_id = auth.uid());
CREATE POLICY trades_insert ON trades FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY trades_update ON trades FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY trades_delete ON trades FOR DELETE USING (user_id = auth.uid());

-- ═══════════════════════════════════════════════════════════════════════
-- Seed default setup library on first read (optional — handled client-side
-- via insertDefaultSetups() on first TraderIQ page load).
--
-- Suggested defaults:
--   Breakout            — buying strength on a level break
--   Mean Reversion      — fade an overextended move back to mean
--   News Catalyst       — earnings/announcement-driven entry
--   Trend Continuation  — pullback in an established uptrend
--   Swing               — multi-day-to-week hold on technical setup
--   Position            — multi-week-to-month conviction position
--   Scalp               — intraday quick-in-quick-out
-- ═══════════════════════════════════════════════════════════════════════

-- Verification:
-- a) Tables exist:
--    SELECT table_name FROM information_schema.tables WHERE table_name IN ('trades','trade_setups');
-- b) RLS active:
--    SELECT tablename, rowsecurity FROM pg_tables WHERE tablename IN ('trades','trade_setups');
-- c) Smoke test (after signed in):
--    INSERT INTO trade_setups (name, description, color) VALUES ('Breakout', 'Buying strength on a level break', '#10B981');
--    INSERT INTO trades (symbol, asset_type, entry_date, entry_price, entry_qty, exit_date, exit_price, exit_qty, pnl, pnl_pct, thesis, lesson)
--    VALUES ('AAPL', 'stock', NOW() - INTERVAL '5 days', 180.00, 10, NOW() - INTERVAL '1 day', 195.50, 10, 155.00, 8.61, 'Earnings beat + guidance raise', 'Held through volatility, plan worked');
-- d) Cleanup:
--    DELETE FROM trades WHERE symbol = 'AAPL' AND thesis LIKE 'Earnings beat%';
--    DELETE FROM trade_setups WHERE name = 'Breakout';
