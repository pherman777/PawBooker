-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run

-- 0042_groomer_self_service.sql granted a groomer UPDATE on a fixed list of
-- their own columns (RLS allows the row, this grant scopes which columns).
-- Two columns added since then were never added to that grant, so groomers
-- got "permission denied for table groomers" trying to save either setting:
--   - multi_pet_discount (added in 0051_bulk_bookings.sql)
--   - requires_rabies_vaccination (added in 0053_vaccination_requirement.sql)
grant update (multi_pet_discount, requires_rabies_vaccination) on groomers to authenticated;
