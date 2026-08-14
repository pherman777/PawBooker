-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run

-- Multi-pet "group" bookings: several pets booked together as a single visit
-- (e.g. an owner bringing all their dogs at once). Each pet stays its own
-- bookings row so availability, invoicing, completion, and payments keep working
-- per-pet unchanged; a booking_groups row ties them together with a shared
-- arrival time and assigned groomer, and records the multi-pet discount that
-- applied at booking time.

create table if not exists booking_groups (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users (id) on delete cascade,
  groomer_id uuid not null references groomers (id) on delete cascade,
  staff_id uuid references salon_staff (id) on delete set null,
  arrival_at timestamptz not null,
  -- Snapshot of the groomer's discount rule as applied to this group. Null when
  -- no discount applied (too few pets, or the salon has no rule set).
  discount_type text check (discount_type in ('percent', 'flat')),
  discount_value integer, -- percent (0-100) or cents off, per discount_type
  created_at timestamptz not null default now()
);

create index if not exists booking_groups_customer_idx on booking_groups (customer_id);
create index if not exists booking_groups_groomer_idx on booking_groups (groomer_id);

alter table booking_groups enable row level security;

drop policy if exists "Customers manage their own booking groups" on booking_groups;
create policy "Customers manage their own booking groups" on booking_groups
  for all using (auth.uid() = customer_id) with check (auth.uid() = customer_id);

drop policy if exists "Groomers view booking groups for their salon" on booking_groups;
create policy "Groomers view booking groups for their salon" on booking_groups
  for select using (
    exists (select 1 from groomers g where g.id = booking_groups.groomer_id and g.user_id = auth.uid())
  );

-- Which group (if any) a booking belongs to. Null = a standalone single-pet
-- booking. on delete set null so removing a group never deletes the appointments.
alter table bookings
  add column if not exists group_id uuid references booking_groups (id) on delete set null;

create index if not exists bookings_group_id_idx on bookings (group_id);

-- Groomer-configured multi-pet discount rule. Null = no multi-pet discount.
-- Shape: { "min_pets": 3, "type": "percent", "value": 10 }
-- The platform never sets this; each salon owns its own pricing.
alter table groomers
  add column if not exists multi_pet_discount jsonb;
