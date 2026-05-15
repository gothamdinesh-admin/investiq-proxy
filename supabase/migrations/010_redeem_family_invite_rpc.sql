-- ═══════════════════════════════════════════════════════════════════════
-- v0.7a follow-up — RPC for atomic invite redemption
--
-- The fi_select RLS policy in migration 007 limits SELECT on family_invites
-- to existing adults. A NEW user trying to redeem can't SELECT the row, so
-- the frontend reports "invite not found".
--
-- Fix: route redemption through a SECURITY DEFINER function that:
--   1. Looks up the invite by token OR code (bypasses fi_select RLS)
--   2. Validates not-used + not-expired + email matches (if email-restricted)
--   3. Inserts family_members row for the caller as the invited role
--   4. Marks invite as used
--   5. Returns success or a structured error string
--
-- All atomic. Caller doesn't need any direct table access.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.redeem_family_invite(
  p_token TEXT DEFAULT NULL,
  p_code  TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite      family_invites%ROWTYPE;
  v_user_id     UUID;
  v_user_email  TEXT;
  v_family_name TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'not signed in');
  END IF;

  -- Look up the invite by token or code
  SELECT * INTO v_invite FROM family_invites
   WHERE (p_token IS NOT NULL AND token = p_token)
      OR (p_code  IS NOT NULL AND code  = upper(trim(p_code)))
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'invite not found');
  END IF;

  -- Already redeemed?
  IF v_invite.used_at IS NOT NULL THEN
    RETURN json_build_object('ok', false, 'error', 'invite already used');
  END IF;
  -- Expired?
  IF v_invite.expires_at < NOW() THEN
    RETURN json_build_object('ok', false, 'error', 'invite expired');
  END IF;

  -- Email-restricted invites: caller's email must match (case-insensitive)
  IF v_invite.email IS NOT NULL THEN
    SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;
    IF lower(v_user_email) <> lower(v_invite.email) THEN
      RETURN json_build_object(
        'ok',    false,
        'error', format('invite is for %s — sign in with that email', v_invite.email)
      );
    END IF;
  END IF;

  -- Already in this family?
  IF EXISTS (
    SELECT 1 FROM family_members
     WHERE family_id = v_invite.family_id AND user_id = v_user_id
  ) THEN
    -- Still mark the invite used so it can't be reused
    UPDATE family_invites SET used_at = NOW(), used_by = v_user_id WHERE id = v_invite.id;
    SELECT name INTO v_family_name FROM families WHERE id = v_invite.family_id;
    RETURN json_build_object(
      'ok',          true,
      'already_in',  true,
      'family_id',   v_invite.family_id,
      'family_name', v_family_name,
      'role',        v_invite.role
    );
  END IF;

  -- Insert membership row + mark invite used
  INSERT INTO family_members (family_id, user_id, role, invited_by)
  VALUES (v_invite.family_id, v_user_id, v_invite.role, v_invite.invited_by);

  UPDATE family_invites
     SET used_at = NOW(), used_by = v_user_id
   WHERE id = v_invite.id;

  SELECT name INTO v_family_name FROM families WHERE id = v_invite.family_id;

  RETURN json_build_object(
    'ok',          true,
    'family_id',   v_invite.family_id,
    'family_name', v_family_name,
    'role',        v_invite.role
  );
END;
$$;

-- Authenticated users can call this; the function itself does the auth checks.
GRANT EXECUTE ON FUNCTION public.redeem_family_invite(TEXT, TEXT) TO authenticated;

-- Verification:
--   SELECT redeem_family_invite(p_code := 'ABCDEF');
--   SELECT redeem_family_invite(p_token := '<paste-token>');
