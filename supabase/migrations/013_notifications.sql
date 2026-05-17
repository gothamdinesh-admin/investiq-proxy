-- ═══════════════════════════════════════════════════════════════════════
-- v0.8e — In-app notifications
--
-- A simple per-user notifications inbox surfacing things the user should
-- know about: failed auto-refreshes, stale prices, missed alerts, system
-- issues, etc. Anything the app would otherwise just log silently goes
-- here so the user can see and act on it.
--
-- Severity levels:
--   info     — informational; pale blue badge
--   warning  — needs attention; amber badge (e.g. stale fund price)
--   error    — something failed; red badge (e.g. cron job hit error)
--   success  — celebratory or completion (e.g. weekly digest sent)
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS notifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL,        -- 'fund_refresh_failed', 'stale_price', 'alert_paused', etc.
  severity      TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','error','success')),
  title         TEXT NOT NULL,
  body          TEXT,                 -- optional longer description (plain text or markdown)
  link_url      TEXT,                 -- optional URL to take action (in-app or external)
  link_label    TEXT,                 -- e.g. 'Open holding', 'Fix in Settings'
  metadata      JSONB,                -- arbitrary structured data (symbol, error, etc.)
  read_at       TIMESTAMPTZ,
  dismissed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notifications_user_idx
  ON notifications(user_id, dismissed_at, created_at DESC);

-- RLS — own-rows-only. Notifications can contain symbols + portfolio
-- specifics; even family adults shouldn't see kids' notifications by
-- default (different from snapshot/portfolio sharing which IS opted in).
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_select ON notifications;
DROP POLICY IF EXISTS notifications_insert ON notifications;
DROP POLICY IF EXISTS notifications_update ON notifications;
DROP POLICY IF EXISTS notifications_delete ON notifications;

CREATE POLICY notifications_select ON notifications FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY notifications_insert ON notifications FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY notifications_update ON notifications FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY notifications_delete ON notifications FOR DELETE
  USING (user_id = auth.uid());

-- Verification:
-- a) Confirm table exists:
--    SELECT table_name FROM information_schema.tables WHERE table_name='notifications';
-- b) Quick smoke test (after signed in):
--    INSERT INTO notifications (kind, severity, title, body)
--    VALUES ('test', 'info', 'Welcome to InvestIQ notifications', 'This row should appear in your bell menu.');
-- c) Cleanup:
--    DELETE FROM notifications WHERE kind = 'test';
