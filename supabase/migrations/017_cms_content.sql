-- ═══════════════════════════════════════════════════════════════════════
-- 017_cms_content.sql — CMS Phase 1: per-edition content overrides.
-- Run in the SQL Editor of EACH project (personal + harbour). Idempotent.
-- Stores admin-edited overrides of the code-default copy in standalone/js/
-- 05-content.js. Anyone may READ (it's public-facing copy, needed on the
-- pre-login gate); only admins (profiles.is_admin) may WRITE.
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.cms_content (
  id          uuid primary key default gen_random_uuid(),
  edition     text not null,
  key         text not null,
  value       text not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null,
  unique (edition, key)
);

alter table public.cms_content enable row level security;

-- READ: open (public copy; needed before login for branding).
drop policy if exists cms_content_read on public.cms_content;
create policy cms_content_read on public.cms_content
  for select using (true);

-- WRITE: admins only.
drop policy if exists cms_content_write on public.cms_content;
create policy cms_content_write on public.cms_content
  for all
  using      (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true));

grant select on public.cms_content to anon, authenticated;
grant insert, update, delete on public.cms_content to authenticated;

notify pgrst, 'reload schema';
