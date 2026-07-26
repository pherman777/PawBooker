-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run

alter table groomers
  add column if not exists city text,
  add column if not exists state text;

alter table bookings
  add column if not exists tax_amount_cents integer;

update groomers set city = 'Medina', state = 'OH' where name = 'Bubbles & Bows Grooming';
update groomers set city = 'Brunswick', state = 'OH' where name = 'The Dapper Dog';
update groomers set city = 'Wadsworth', state = 'OH' where name = 'Purrfect Paws Spa';
