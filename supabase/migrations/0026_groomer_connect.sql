-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run

alter table groomers
  add column if not exists stripe_connect_account_id text,
  add column if not exists stripe_connect_charges_enabled boolean not null default false,
  add column if not exists stripe_connect_payouts_enabled boolean not null default false;
