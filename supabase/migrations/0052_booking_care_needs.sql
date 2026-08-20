-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run

-- Care-needs flags move from the pet profile to the booking itself. A pet's
-- matting/anxiety/etc. can change between visits (e.g. resolved after a groom,
-- or a formerly-nervous dog completes training), so a permanent pet-level flag
-- goes stale. Capturing it fresh per booking keeps it accurate and matches how
-- it's actually used - every consumer (groomer dashboard, completion screens,
-- booking email) only ever reads this in the context of a specific visit.
-- The old columns on `pets` (0048_pet_care_needs.sql) are left in place,
-- unused, rather than dropped - no historical data needs migrating since this
-- is captured fresh going forward.
alter table bookings
  add column if not exists is_anxious boolean not null default false,
  add column if not exists is_matted boolean not null default false,
  add column if not exists needs_extra_care boolean not null default false,
  add column if not exists care_notes text;
