-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run
--
-- Dummy salons mirroring the existing Ohio seed groomers (same bio, rating,
-- review_count, phone/email, hours, and services), but located in
-- Maricopa, AZ 85138 with an America/Phoenix timezone.

with new_groomers as (
  insert into groomers (
    name, bio, address, rating, review_count,
    zip_code, latitude, longitude, city, state,
    phone, email, hours, timezone
  ) values
    (
      'Bubbles & Bows Grooming',
      'Full-service grooming for dogs and cats of all sizes.',
      '19345 N John Wayne Pkwy, Maricopa, AZ 85138',
      4.8, 126,
      '85138', 33.0674, -112.0432, 'Maricopa', 'AZ',
      '(330) 555-0142', 'hello@bubblesandbows.example',
      '{
        "monday": {"open": "09:00", "close": "17:00"},
        "tuesday": {"open": "09:00", "close": "17:00"},
        "wednesday": {"open": "09:00", "close": "17:00"},
        "thursday": {"open": "09:00", "close": "17:00"},
        "friday": {"open": "09:00", "close": "17:00"},
        "saturday": {"open": "09:00", "close": "14:00"},
        "sunday": null
      }'::jsonb,
      'America/Phoenix'
    ),
    (
      'The Dapper Dog',
      'Breed-specific cuts and hand-stripping specialists.',
      '44490 W Honeycutt Rd, Maricopa, AZ 85138',
      4.6, 82,
      '85138', 33.0521, -112.0559, 'Maricopa', 'AZ',
      '(330) 555-0198', 'appointments@thedapperdog.example',
      '{
        "monday": null,
        "tuesday": {"open": "10:00", "close": "18:00"},
        "wednesday": {"open": "10:00", "close": "18:00"},
        "thursday": {"open": "10:00", "close": "18:00"},
        "friday": {"open": "10:00", "close": "18:00"},
        "saturday": {"open": "09:00", "close": "16:00"},
        "sunday": {"open": "09:00", "close": "13:00"}
      }'::jsonb,
      'America/Phoenix'
    ),
    (
      'Purrfect Paws Spa',
      'Gentle, low-stress grooming with a cat-only suite.',
      '41103 W Smith Enke Rd, Maricopa, AZ 85138',
      4.9, 201,
      '85138', 33.0398, -112.0287, 'Maricopa', 'AZ',
      '(330) 555-0177', 'meow@purrfectpawsspa.example',
      '{
        "monday": {"open": "08:00", "close": "16:00"},
        "tuesday": {"open": "08:00", "close": "16:00"},
        "wednesday": {"open": "08:00", "close": "16:00"},
        "thursday": {"open": "08:00", "close": "16:00"},
        "friday": {"open": "08:00", "close": "16:00"},
        "saturday": null,
        "sunday": null
      }'::jsonb,
      'America/Phoenix'
    )
  returning id, name
)
insert into groomer_services (groomer_id, name, price_cents, duration_minutes)
select new_groomers.id, service.name, service.price_cents, service.duration_minutes
from new_groomers, (
  values
    ('Bubbles & Bows Grooming', 'Bath & Brush', 4500, 45),
    ('Bubbles & Bows Grooming', 'Full Groom', 8500, 90),
    ('Bubbles & Bows Grooming', 'Nail Trim', 1500, 15),
    ('The Dapper Dog', 'Breed Cut', 9500, 100),
    ('The Dapper Dog', 'Bath & Brush', 5000, 45),
    ('Purrfect Paws Spa', 'Cat Bath & Brush', 5500, 40),
    ('Purrfect Paws Spa', 'Full Groom', 9000, 75)
) as service(groomer_name, name, price_cents, duration_minutes)
where service.groomer_name = new_groomers.name;
