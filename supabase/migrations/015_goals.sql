-- ═══════════════════════════════════════════════════════════════════════
-- 015 — Goals & Targets (v0.15)
--
-- Lets users set portfolio-level milestones like '$100k by 2030' and
-- track on-track / off-track progress with a projection that accounts
-- for current value, planned monthly contributions, and an assumed
-- annual return.
--
-- Schema:
--   investment_goals — every goal (active or archived) per user
--
-- RLS: own-rows-only.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS investment_goals (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,

  name                  TEXT NOT NULL,             -- 'First home deposit', 'Retire at 55', etc.
  target_amount         NUMERIC(20,2) NOT NULL,    -- e.g. 100000
  target_date           DATE NOT NULL,             -- e.g. '2030-12-31'
  currency              TEXT NOT NULL DEFAULT 'NZD',

  -- Scope — what portion of the portfolio counts toward this goal
  scope                 TEXT NOT NULL DEFAULT 'portfolio' CHECK (scope IN ('portfolio','category','symbol')),
  scope_value           TEXT,                       -- 'crypto' / 'kiwisaver' / 'AAPL'

  -- Plan inputs
  starting_amount       NUMERIC(20,2) DEFAULT 0,    -- baseline at creation
  monthly_contribution  NUMERIC(20,2) DEFAULT 0,    -- planned monthly add
  expected_return_pct   NUMERIC(8,4) DEFAULT 7.0,   -- assumed annual return

  -- Cosmetics
  icon                  TEXT,                       -- emoji
  color                 TEXT,                       -- hex / css var

  archived              BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS investment_goals_user_idx
  ON investment_goals(user_id, archived, target_date);

CREATE OR REPLACE FUNCTION _investment_goals_touch() RETURNS trigger AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS investment_goals_touch ON investment_goals;
CREATE TRIGGER investment_goals_touch BEFORE UPDATE ON investment_goals
  FOR EACH ROW EXECUTE FUNCTION _investment_goals_touch();

ALTER TABLE investment_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS goals_select ON investment_goals;
DROP POLICY IF EXISTS goals_insert ON investment_goals;
DROP POLICY IF EXISTS goals_update ON investment_goals;
DROP POLICY IF EXISTS goals_delete ON investment_goals;

CREATE POLICY goals_select ON investment_goals FOR SELECT USING (user_id = auth.uid());
CREATE POLICY goals_insert ON investment_goals FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY goals_update ON investment_goals FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY goals_delete ON investment_goals FOR DELETE USING (user_id = auth.uid());

-- Verification:
-- SELECT table_name FROM information_schema.tables WHERE table_name = 'investment_goals';
-- SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'investment_goals';
