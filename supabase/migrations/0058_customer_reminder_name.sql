-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run

-- Same denormalization as bookings.customer_name (0057) - lets the win-back
-- reminders list and the drafted email itself address the customer by name.
alter table customer_reminders add column if not exists customer_name text;
