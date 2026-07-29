-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run

alter table bookings
  add column if not exists payment_method text check (payment_method in ('card', 'cash'));

-- Backfill existing paid bookings as card payments, since that was the only
-- option before cash support was added.
update bookings set payment_method = 'card' where payment_status = 'paid' and payment_method is null;
