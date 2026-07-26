-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run

alter table bookings
  add column if not exists cancellation_reason text,
  add column if not exists customer_email text;
