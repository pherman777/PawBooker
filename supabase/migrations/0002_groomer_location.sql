-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run

alter table groomers
  add column if not exists zip_code text,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

update groomers set address = '123 Maple St, Medina, OH 44256', zip_code = '44256', latitude = 41.1384, longitude = -81.8632
  where name = 'Bubbles & Bows Grooming';

update groomers set address = '45 Oak Ave, Brunswick, OH 44212', zip_code = '44212', latitude = 41.2379, longitude = -81.8365
  where name = 'The Dapper Dog';

update groomers set address = '900 Birch Rd, Wadsworth, OH 44281', zip_code = '44281', latitude = 41.0272, longitude = -81.7301
  where name = 'Purrfect Paws Spa';
