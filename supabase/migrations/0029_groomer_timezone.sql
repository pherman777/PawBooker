-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run

alter table groomers
  add column if not exists timezone text not null default 'America/Phoenix';

update groomers set timezone = 'America/Phoenix'
  where name in ('Bubbles & Bows Grooming', 'The Dapper Dog', 'Purrfect Paws Spa');
