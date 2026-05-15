-- ═══════════════════════════════════════════════════════════════════════
-- v0.7a follow-up — let family members read each other's profile rows
--
-- The profiles table's default SELECT policy only allows reading your own
-- row (auth.uid() = id). When loadFamilyMembers tries to look up emails
-- for fellow family members, it returns zero rows — every profile is
-- invisible.
--
-- Add an ADDITIONAL SELECT policy that uses can_view_user() (already
-- defined in migration 007). This means:
--   - Adults still see all family members' profiles
--   - Teens/children/viewers still see only their own profile
--   - Non-family-members can't see anything
-- ═══════════════════════════════════════════════════════════════════════

-- Drop and recreate so this is idempotent.
DROP POLICY IF EXISTS profiles_family_select ON profiles;

CREATE POLICY profiles_family_select ON profiles FOR SELECT
  USING (can_view_user(id));

-- Verification:
-- a) Confirm policy exists:
--    SELECT policyname, cmd, qual FROM pg_policies
--    WHERE schemaname='public' AND tablename='profiles';
-- b) As a logged-in adult in family F, this should return all family members:
--    SELECT id, email, display_name FROM profiles WHERE id IN (
--      SELECT user_id FROM family_members WHERE family_id = '<family-id>'
--    );
