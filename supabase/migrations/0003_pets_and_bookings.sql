-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run

create table if not exists pets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  species text not null check (species in ('dog', 'cat', 'other')),
  breed text,
  created_at timestamptz not null default now()
);

create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users (id) on delete cascade,
  groomer_id uuid not null references groomers (id) on delete cascade,
  pet_id uuid not null references pets (id) on delete cascade,
  service_id uuid not null references groomer_services (id) on delete cascade,
  starts_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'completed', 'cancelled')),
  created_at timestamptz not null default now()
);

alter table pets enable row level security;
alter table bookings enable row level security;

create policy "Users manage their own pets" on pets
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create policy "Users manage their own bookings" on bookings
  for all using (auth.uid() = customer_id) with check (auth.uid() = customer_id);
