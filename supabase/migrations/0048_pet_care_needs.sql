-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run

-- Grooming care-needs flags captured on the pet profile. Any flag set to true
-- requires care_notes (enforced in the app). These surface to the groomer so
-- they can plan handling and adjust the final price at completion.
alter table pets
  add column if not exists is_anxious boolean not null default false,
  add column if not exists is_matted boolean not null default false,
  add column if not exists needs_extra_care boolean not null default false,
  add column if not exists care_notes text;
