-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run

create table if not exists groomers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  avatar_url text,
  bio text,
  address text not null,
  rating numeric(2, 1) not null default 0,
  review_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists groomer_services (
  id uuid primary key default gen_random_uuid(),
  groomer_id uuid not null references groomers (id) on delete cascade,
  name text not null,
  price_cents integer not null,
  duration_minutes integer not null
);

alter table groomers enable row level security;
alter table groomer_services enable row level security;

create policy "Groomers are publicly readable" on groomers
  for select using (true);

create policy "Groomer services are publicly readable" on groomer_services
  for select using (true);

-- Seed data so the Browse screen has something to show immediately.
insert into groomers (name, bio, address, rating, review_count) values
  ('Bubbles & Bows Grooming', 'Full-service grooming for dogs and cats of all sizes.', '123 Maple St, Springfield', 4.8, 126),
  ('The Dapper Dog', 'Breed-specific cuts and hand-stripping specialists.', '45 Oak Ave, Springfield', 4.6, 82),
  ('Purrfect Paws Spa', 'Gentle, low-stress grooming with a cat-only suite.', '900 Birch Rd, Springfield', 4.9, 201)
on conflict do nothing;

insert into groomer_services (groomer_id, name, price_cents, duration_minutes)
select id, service.name, service.price_cents, service.duration_minutes
from groomers, (
  values
    ('Bath & Brush', 4500, 45),
    ('Full Groom', 8500, 90),
    ('Nail Trim', 1500, 15)
) as service(name, price_cents, duration_minutes)
where groomers.name = 'Bubbles & Bows Grooming'
on conflict do nothing;

insert into groomer_services (groomer_id, name, price_cents, duration_minutes)
select id, service.name, service.price_cents, service.duration_minutes
from groomers, (
  values
    ('Breed Cut', 9500, 100),
    ('Bath & Brush', 5000, 45)
) as service(name, price_cents, duration_minutes)
where groomers.name = 'The Dapper Dog'
on conflict do nothing;

insert into groomer_services (groomer_id, name, price_cents, duration_minutes)
select id, service.name, service.price_cents, service.duration_minutes
from groomers, (
  values
    ('Cat Bath & Brush', 5500, 40),
    ('Full Groom', 9000, 75)
) as service(name, price_cents, duration_minutes)
where groomers.name = 'Purrfect Paws Spa'
on conflict do nothing;
