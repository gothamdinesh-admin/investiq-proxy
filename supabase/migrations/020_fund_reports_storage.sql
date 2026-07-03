-- ═══════════════════════════════════════════════════════════════════════
-- 020_fund_reports_storage.sql — Storage for the OFFICIAL Harbour fund
-- report PDFs (the monthly Reporting_<CODE>_<MMMYY>.pdf documents).
--
-- RUN IN THE HARBOUR PROJECT (SQL Editor). Idempotent. Optional in personal.
--
-- Layout:  fund-reports/<FUND KEY>/<filename>.pdf
--   e.g.   fund-reports/AUSTRALASIAN-EQUITY/Reporting_HARAEQ_Apr26.pdf
-- The app derives <FUND KEY> from the normalised fund name, so uploaded
-- reports automatically show on the matching fund book's Reports page.
--
-- Access model (these are internal documents):
--   READ   → any signed-in, APPROVED user (the Harbour IQ trial group)
--   WRITE  → admins only
--   Bucket is PRIVATE — the app serves files via short-lived signed URLs.
-- ═══════════════════════════════════════════════════════════════════════

-- 1) Private bucket (25MB per file, PDFs only).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fund-reports', 'fund-reports', false, 26214400, array['application/pdf'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public = false;

-- 2) Policies on storage.objects, scoped to this bucket.
drop policy if exists "fund_reports_read"   on storage.objects;
create policy "fund_reports_read" on storage.objects
  for select using (
    bucket_id = 'fund-reports'
    and exists (select 1 from public.profiles p
                 where p.id = auth.uid()
                   and (p.is_approved = true or p.is_admin = true))
  );

drop policy if exists "fund_reports_admin_write" on storage.objects;
create policy "fund_reports_admin_write" on storage.objects
  for insert with check (
    bucket_id = 'fund-reports'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );

drop policy if exists "fund_reports_admin_update" on storage.objects;
create policy "fund_reports_admin_update" on storage.objects
  for update using (
    bucket_id = 'fund-reports'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );

drop policy if exists "fund_reports_admin_delete" on storage.objects;
create policy "fund_reports_admin_delete" on storage.objects
  for delete using (
    bucket_id = 'fund-reports'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );

notify pgrst, 'reload schema';
