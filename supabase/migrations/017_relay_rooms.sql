-- 017_relay_rooms.sql — shared team state for the Pillar to Pōu relay app
-- (standalone/relay.html). One row per room code; the app upserts the whole
-- plan/race state as JSON and every phone polls for changes.
--
-- SECURITY NOTE: anon read/write is intentional here — the relay app has no
-- login, room codes are random, and the data is a non-sensitive run-day plan.
-- This table is isolated from all InvestIQ user data and its policies grant
-- access to relay_rooms ONLY. Do not reuse this pattern for real user data.
--
-- Idempotent: safe to re-run.

create table if not exists public.relay_rooms (
  room_code  text primary key,
  state      jsonb not null,
  rev        bigint not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.relay_rooms enable row level security;

drop policy if exists relay_rooms_anon_select on public.relay_rooms;
create policy relay_rooms_anon_select on public.relay_rooms
  for select to anon using (true);

drop policy if exists relay_rooms_anon_insert on public.relay_rooms;
create policy relay_rooms_anon_insert on public.relay_rooms
  for insert to anon with check (true);

drop policy if exists relay_rooms_anon_update on public.relay_rooms;
create policy relay_rooms_anon_update on public.relay_rooms
  for update to anon using (true) with check (true);
