-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run

-- Marks when the groomer manually indicates the grooming itself is done,
-- distinct from `status = 'completed'` which only happens once it's been
-- invoiced and paid. Confirmed bookings without this set show "Complete
-- Service"; once set, they show "Complete & Invoice" instead.
alter table bookings
  add column if not exists service_completed_at timestamptz;
