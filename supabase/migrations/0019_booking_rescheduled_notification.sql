-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run

-- The chat agent can reschedule a booking on the customer's behalf, so the
-- groomer needs an in-app/push notification for that too, not just
-- new-request and cancellation.
alter table groomer_notifications drop constraint if exists groomer_notifications_type_check;
alter table groomer_notifications
  add constraint groomer_notifications_type_check
  check (type in ('booking_requested', 'booking_cancelled', 'booking_rescheduled'));
