-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run

-- Optional identification and emergency contact info for a pet. Unlike the
-- required breed/color/weight, these are never mandatory - they're a convenience
-- so a groomer has chip and vet details on hand if something goes wrong.
alter table pets
  add column if not exists is_microchipped boolean not null default false,
  add column if not exists microchip_number text,
  add column if not exists vet_name text,
  add column if not exists vet_phone text;
