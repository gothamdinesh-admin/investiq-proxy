-- ═══════════════════════════════════════════════════════════════════════
-- 019_proxy_secret_rpcs.sql — the proxy-auth RPCs, finally version-controlled.
--
-- These two functions were created ad-hoc in the personal project long ago and
-- were never in a migration, so the Harbour clone doesn't have them — which is
-- why per-user proxy auth (X-Proxy-Secret) fails there with rpc_reject.
--
-- RUN IN THE HARBOUR PROJECT (required). Safe to also run in personal — it's
-- CREATE OR REPLACE, idempotent, and matches the existing behaviour.
--
-- How they're used:
--   • generate_proxy_secret()  → app (Admin → "↻ Secret" / approve) calls it to
--     mint a 48-hex-char (192-bit) secret, then writes it to profiles.proxy_secret.
--   • validate_proxy_secret(secret) → the Render proxy POSTs {"secret": ...} and
--     expects the approved user's id (uuid) back, or null. SECURITY DEFINER so the
--     anon key can look up across profiles despite RLS. Only APPROVED users match.
-- ═══════════════════════════════════════════════════════════════════════

-- Mint a random secret (does not store it — the caller writes it to profiles).
create or replace function public.generate_proxy_secret()
returns text
language sql
volatile
as $$
  select encode(gen_random_bytes(24), 'hex');
$$;

-- Resolve a presented secret → the approved user's id (or null).
-- SECURITY DEFINER + fixed search_path so it bypasses RLS safely.
create or replace function public.validate_proxy_secret(secret text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id
    from public.profiles p
   where p.proxy_secret = secret
     and p.is_approved = true
   limit 1;
$$;

-- The app calls generate_proxy_secret as a signed-in user; the proxy calls
-- validate_proxy_secret with the anon key.
grant execute on function public.generate_proxy_secret()          to authenticated;
grant execute on function public.validate_proxy_secret(text)      to anon, authenticated;

notify pgrst, 'reload schema';
