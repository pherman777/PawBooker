-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run

-- Tips are charged as their own separate off-session payment after the
-- original invoice is already closed out, since the groomer completes
-- billing on their own schedule before a customer would typically tip.
alter table bookings
  add column if not exists tip_amount_cents integer,
  add column if not exists tip_payment_intent_id text,
  add column if not exists tip_paid_at timestamptz;
