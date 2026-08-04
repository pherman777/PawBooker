-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run

create table if not exists groomer_supplies (
  id uuid primary key default gen_random_uuid(),
  groomer_id uuid not null references groomers (id) on delete cascade,
  name text not null,
  unit text not null default 'unit',
  quantity_on_hand numeric not null default 0,
  reorder_threshold numeric not null default 0,
  reorder_quantity numeric,
  created_at timestamptz not null default now()
);

alter table groomer_supplies enable row level security;

-- Manual-only tracking (no auto-decrement from bookings), so groomers need
-- full CRUD on their own supplies - there's no other writer.
create policy "Groomers manage their own supplies" on groomer_supplies
  for all using (
    exists (
      select 1 from groomers
      where groomers.id = groomer_supplies.groomer_id
      and groomers.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from groomers
      where groomers.id = groomer_supplies.groomer_id
      and groomers.user_id = auth.uid()
    )
  );
