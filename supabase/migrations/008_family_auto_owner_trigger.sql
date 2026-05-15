-- ═══════════════════════════════════════════════════════════════════════
-- v0.7a fix-up — auto-add family creator as owner via trigger
--
-- Without this, `INSERT INTO families … RETURNING *` fails RLS because
-- the SELECT-back policy (is_family_member(id)) returns false: the
-- creator isn't a member yet. The client used to do a second INSERT
-- into family_members to fix this, but the first round-trip's
-- implicit RETURNING already blew up before that could run.
--
-- Solution: trigger does it server-side, atomically, before the row
-- is returned to the client. Also defaults created_by to auth.uid()
-- so the client doesn't need to pass it (removes one source of
-- "did your local _supaUser.id stay in sync with the JWT?" bugs).
-- ═══════════════════════════════════════════════════════════════════════

-- 1. Default created_by to the calling user. Client can still pass it
--    explicitly; the default only fires when the column is omitted.
ALTER TABLE families ALTER COLUMN created_by SET DEFAULT auth.uid();

-- 2. Trigger function: after a family row is inserted, add the creator
--    as 'owner' in family_members. Idempotent on re-runs (ON CONFLICT).
CREATE OR REPLACE FUNCTION public.auto_add_family_owner()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO family_members (family_id, user_id, role, display_name, invited_by)
  VALUES (NEW.id, NEW.created_by, 'owner', NULL, NEW.created_by)
  ON CONFLICT (family_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS family_auto_owner ON families;
CREATE TRIGGER family_auto_owner
  AFTER INSERT ON families
  FOR EACH ROW EXECUTE FUNCTION public.auto_add_family_owner();

-- 3. Relax SELECT policy on families so the creator can read their
--    own family even before the trigger has run (defensive — the
--    trigger fires before RETURNING anyway, but this prevents any
--    edge case where _supaUser.id != auth.uid() during the round-trip).
DROP POLICY IF EXISTS families_select ON families;
CREATE POLICY families_select ON families FOR SELECT
  USING (is_family_member(id) OR created_by = auth.uid());

-- Verification:
-- a) Trigger registered?
--    SELECT trigger_name, event_manipulation FROM information_schema.triggers
--    WHERE event_object_table = 'families';
-- b) Default set?
--    SELECT column_default FROM information_schema.columns
--    WHERE table_name='families' AND column_name='created_by';
