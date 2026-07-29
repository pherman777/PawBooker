-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run

alter table groomers
  add column if not exists stripe_cancel_at_period_end boolean not null default false;
