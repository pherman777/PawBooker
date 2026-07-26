-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run

alter table pets
  add column if not exists color text,
  add column if not exists weight_lbs numeric(5, 1);
