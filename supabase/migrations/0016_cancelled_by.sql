-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run

-- Tracks which side cancelled a booking, so the groomer's Insights screen can
-- report a cancellation rate split between customer- and groomer-initiated.
alter table bookings
  add column if not exists cancelled_by text check (cancelled_by in ('customer', 'groomer'));
