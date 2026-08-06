-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run
--
-- Stores "notify me" email signups from the public marketing site
-- (paw-booker.com), submitted directly from static HTML via the anon key.
-- Insert-only for anon: the public site can add an email but never read the
-- list back, so the anon key can't be used to scrape collected addresses.

create table if not exists marketing_leads (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  source text not null default 'homepage',
  created_at timestamptz not null default now()
);

alter table marketing_leads enable row level security;

create policy "Anyone can submit a marketing lead" on marketing_leads
  for insert
  to anon
  with check (true);
