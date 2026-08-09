-- Record the platform acquisition fee on the booking itself (not just the
-- groomer_customers ledger) so the groomer can see, per appointment, exactly
-- what PawBooker took and what they received.
alter table bookings add column if not exists platform_fee_cents integer not null default 0;
