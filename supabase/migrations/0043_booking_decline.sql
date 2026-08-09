-- "Declined" is distinct from "cancelled": a groomer turns down a still-pending
-- request (usually with a note suggesting another day/time), and the customer can
-- rebook. Cancelled stays for calling off an already-confirmed appointment. The
-- groomer's note is stored in the existing cancellation_reason column.
alter table bookings drop constraint if exists bookings_status_check;
alter table bookings
  add constraint bookings_status_check
  check (status in ('pending', 'confirmed', 'completed', 'cancelled', 'declined'));
