-- ═══════════════════════════════════════════════════════════════════════
-- v0.7a — Family Platform Foundation
-- One-time setup. Paste into Supabase Dashboard → SQL Editor → Run.
-- Adds: families, family_members, family_invites tables + RLS + helpers.
-- Extends: profiles (active_family_id, plan_tier).
-- ═══════════════════════════════════════════════════════════════════════

-- 1. Profile additions ─────────────────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS active_family_id  UUID,
  ADD COLUMN IF NOT EXISTS plan_tier         TEXT NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS display_name      TEXT;

-- Plan tiers (for future paywall — currently no enforcement):
--   'free'   — solo, basic features
--   'pro'    — solo with AI agents + alerts (future)
--   'family' — up to 6 members per family
--   'admin'  — platform admin (you)
ALTER TABLE profiles
  ADD CONSTRAINT profiles_plan_tier_check CHECK (plan_tier IN ('free','pro','family','admin'));

-- 2. families ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS families (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  created_by  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. family_members ────────────────────────────────────────────────────
-- One row per (family, user) pair. Allows multi-family membership.
CREATE TABLE IF NOT EXISTS family_members (
  family_id     UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role          TEXT NOT NULL,
  display_name  TEXT,          -- per-family display name (Mum / Dad / Lina / Sam)
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  invited_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (family_id, user_id),
  CHECK (role IN ('owner','adult','teen','child','viewer'))
);

CREATE INDEX IF NOT EXISTS family_members_user_idx ON family_members(user_id);

-- 4. family_invites ────────────────────────────────────────────────────
-- token       — single-use 32-byte URL token (email invite path)
-- code        — short 6-char human-typeable code (verbal invite path)
-- email       — optional, restricts who can redeem this invite
-- Either token OR code can be used to redeem. Both expire.
CREATE TABLE IF NOT EXISTS family_invites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id   UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  invited_by  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT,             -- nullable — code-only invites have no email
  role        TEXT NOT NULL,
  token       TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  code        TEXT UNIQUE NOT NULL DEFAULT upper(substring(encode(gen_random_bytes(6), 'hex'), 1, 6)),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  used_at     TIMESTAMPTZ,
  used_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (role IN ('owner','adult','teen','child','viewer'))
);

CREATE INDEX IF NOT EXISTS family_invites_family_idx ON family_invites(family_id);
CREATE INDEX IF NOT EXISTS family_invites_code_idx   ON family_invites(code) WHERE used_at IS NULL;

-- 5. Helper functions (SECURITY DEFINER avoids RLS recursion) ──────────

-- Returns true if the calling user is a member of the given family.
CREATE OR REPLACE FUNCTION public.is_family_member(fam_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM family_members
    WHERE family_id = fam_id AND user_id = auth.uid()
  );
$$;

-- Returns the calling user's role in a family ('' if not a member).
CREATE OR REPLACE FUNCTION public.my_family_role(fam_id UUID)
RETURNS TEXT
LANGUAGE SQL SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role FROM family_members WHERE family_id = fam_id AND user_id = auth.uid()),
    ''
  );
$$;

-- Returns true if the calling user can view another user's portfolio data
-- under the hierarchical model:
--   - Always yourself
--   - Owner/adult sees: all roles in any family they share
--   - Teen sees: only themselves
--   - Child sees: only themselves
--   - Viewer sees: only themselves (read-only on their own data)
-- Two users must share at least one family for cross-view to apply.
CREATE OR REPLACE FUNCTION public.can_view_user(target_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT
    target_user_id = auth.uid()  -- always see yourself
    OR EXISTS (
      SELECT 1
      FROM family_members me
      JOIN family_members them ON them.family_id = me.family_id
      WHERE me.user_id = auth.uid()
        AND them.user_id = target_user_id
        AND me.role IN ('owner', 'adult')   -- only adults can see other members
    );
$$;

-- 6. RLS on the new tables ─────────────────────────────────────────────

ALTER TABLE families        ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_invites  ENABLE ROW LEVEL SECURITY;

-- families: any member can see, only owners can update/delete
DROP POLICY IF EXISTS families_select   ON families;
DROP POLICY IF EXISTS families_insert   ON families;
DROP POLICY IF EXISTS families_update   ON families;
DROP POLICY IF EXISTS families_delete   ON families;

CREATE POLICY families_select ON families FOR SELECT
  USING (is_family_member(id));

CREATE POLICY families_insert ON families FOR INSERT
  WITH CHECK (created_by = auth.uid());

CREATE POLICY families_update ON families FOR UPDATE
  USING (my_family_role(id) = 'owner');

CREATE POLICY families_delete ON families FOR DELETE
  USING (my_family_role(id) = 'owner');

-- family_members: members see their own family's roster; owners can add/remove
DROP POLICY IF EXISTS fm_select  ON family_members;
DROP POLICY IF EXISTS fm_insert  ON family_members;
DROP POLICY IF EXISTS fm_update  ON family_members;
DROP POLICY IF EXISTS fm_delete  ON family_members;

CREATE POLICY fm_select ON family_members FOR SELECT
  USING (is_family_member(family_id));

-- Inserts: bootstrap-friendly. Either you're inserting yourself (joining via
-- accepted invite, the Edge Function does this), OR you're an owner adding
-- someone after they accepted.
CREATE POLICY fm_insert ON family_members FOR INSERT
  WITH CHECK (user_id = auth.uid() OR my_family_role(family_id) = 'owner');

CREATE POLICY fm_update ON family_members FOR UPDATE
  USING (my_family_role(family_id) IN ('owner','adult'));

CREATE POLICY fm_delete ON family_members FOR DELETE
  USING (my_family_role(family_id) = 'owner' OR user_id = auth.uid());

-- family_invites: owners/adults can create + see; anyone can read by token (handled in Edge Function)
DROP POLICY IF EXISTS fi_select  ON family_invites;
DROP POLICY IF EXISTS fi_insert  ON family_invites;
DROP POLICY IF EXISTS fi_delete  ON family_invites;

CREATE POLICY fi_select ON family_invites FOR SELECT
  USING (my_family_role(family_id) IN ('owner','adult'));

CREATE POLICY fi_insert ON family_invites FOR INSERT
  WITH CHECK (my_family_role(family_id) IN ('owner','adult') AND invited_by = auth.uid());

CREATE POLICY fi_delete ON family_invites FOR DELETE
  USING (my_family_role(family_id) = 'owner' OR invited_by = auth.uid());

-- 7. Extend existing tables' RLS to allow family-based read ────────────
-- Adults in your family can read your portfolio + snapshots (hierarchical
-- visibility). You still only WRITE your own. RLS rule added on TOP of
-- existing 'owner-only' policies — uses can_view_user() helper.

DROP POLICY IF EXISTS portfolios_family_select ON investiq_portfolios;
CREATE POLICY portfolios_family_select ON investiq_portfolios FOR SELECT
  USING (can_view_user(user_id));

DROP POLICY IF EXISTS snapshots_family_select ON investiq_snapshots;
CREATE POLICY snapshots_family_select ON investiq_snapshots FOR SELECT
  USING (can_view_user(user_id));

-- ═══════════════════════════════════════════════════════════════════════
-- Verification queries to run after the migration ─────────────────────
-- ═══════════════════════════════════════════════════════════════════════
-- a) Confirm tables exist:
--    SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'famil%';
--
-- b) Confirm your profile got the new columns:
--    SELECT id, email, plan_tier, active_family_id FROM profiles WHERE email = 'gothamdinesh@gmail.com';
--
-- c) Once you create a family + invite someone, this should return your roster:
--    SELECT f.name, fm.user_id, fm.role, fm.display_name, fm.joined_at
--    FROM families f JOIN family_members fm ON fm.family_id = f.id;
--
-- d) To rollback this entire migration (UNDO everything above):
--    DROP TABLE IF EXISTS family_invites CASCADE;
--    DROP TABLE IF EXISTS family_members CASCADE;
--    DROP TABLE IF EXISTS families CASCADE;
--    DROP FUNCTION IF EXISTS public.is_family_member;
--    DROP FUNCTION IF EXISTS public.my_family_role;
--    DROP FUNCTION IF EXISTS public.can_view_user;
--    ALTER TABLE profiles
--      DROP COLUMN IF EXISTS active_family_id,
--      DROP COLUMN IF EXISTS plan_tier,
--      DROP COLUMN IF EXISTS display_name;
