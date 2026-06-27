-- ═══════════════════════════════════════════════════════════════════════
-- 018_user_approval.sql — admin approval gate for new signups.
-- Run in the SQL Editor of EACH project (personal + harbour). Idempotent.
--
-- New users land is_approved=false → the app shows the "pending approval"
-- overlay and blocks access until an admin approves them in Admin → Users.
-- Existing users (at migration time) + all admins are backfilled to approved
-- so nobody currently using the app gets locked out.
--
-- SECURITY: a trigger prevents a non-admin from changing is_admin / is_approved
-- on their own row (RLS lets users update their profile, so without this they
-- could self-approve via the API). service_role (Edge Functions) bypasses.
-- ═══════════════════════════════════════════════════════════════════════

-- 1) Column (default false → new signups are pending).
alter table public.profiles
  add column if not exists is_approved boolean not null default false;

-- 2) Backfill: everyone who already exists at migration time keeps access,
--    and admins are always approved. New rows created after this run = false.
update public.profiles set is_approved = true where created_at < now();
update public.profiles set is_approved = true where is_admin = true;

-- 3) Guard privileged columns against self-elevation.
create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Server-side / cron contexts bypass (Edge Functions use the service role).
  if auth.role() = 'service_role' then
    return new;
  end if;
  -- If is_admin or is_approved is being changed, only an admin may do it.
  if (new.is_admin    is distinct from old.is_admin)
  or (new.is_approved is distinct from old.is_approved) then
    if not exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    ) then
      -- Silently revert the privileged fields; allow the rest of the update.
      new.is_admin    := old.is_admin;
      new.is_approved := old.is_approved;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_profile_privileges on public.profiles;
create trigger trg_protect_profile_privileges
  before update on public.profiles
  for each row execute function public.protect_profile_privileges();

notify pgrst, 'reload schema';
