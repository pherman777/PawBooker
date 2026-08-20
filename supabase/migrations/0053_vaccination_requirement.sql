-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run

-- Whether a groomer requires a current rabies vaccination on file before a
-- pet can be booked. Defaults to true so existing behavior (always required)
-- is unchanged for every current groomer unless they explicitly opt out.
alter table groomers
  add column if not exists requires_rabies_vaccination boolean not null default true;
