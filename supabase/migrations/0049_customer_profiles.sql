-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run

-- Lightweight per-user profile for customer-editable contact info. Email and
-- password live in auth.users; this table holds the phone number. Kept separate
-- from groomers so a customer never needs a groomer row to have a profile.
create table if not exists profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  phone text,
  updated_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "Users manage their own profile" on profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
