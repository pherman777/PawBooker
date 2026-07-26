-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run

alter table groomers
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists hours jsonb;

update groomers set
  phone = '(330) 555-0142',
  email = 'hello@bubblesandbows.example',
  hours = '{
    "monday": {"open": "09:00", "close": "17:00"},
    "tuesday": {"open": "09:00", "close": "17:00"},
    "wednesday": {"open": "09:00", "close": "17:00"},
    "thursday": {"open": "09:00", "close": "17:00"},
    "friday": {"open": "09:00", "close": "17:00"},
    "saturday": {"open": "09:00", "close": "14:00"},
    "sunday": null
  }'::jsonb
where name = 'Bubbles & Bows Grooming';

update groomers set
  phone = '(330) 555-0198',
  email = 'appointments@thedapperdog.example',
  hours = '{
    "monday": null,
    "tuesday": {"open": "10:00", "close": "18:00"},
    "wednesday": {"open": "10:00", "close": "18:00"},
    "thursday": {"open": "10:00", "close": "18:00"},
    "friday": {"open": "10:00", "close": "18:00"},
    "saturday": {"open": "09:00", "close": "16:00"},
    "sunday": {"open": "09:00", "close": "13:00"}
  }'::jsonb
where name = 'The Dapper Dog';

update groomers set
  phone = '(330) 555-0177',
  email = 'meow@purrfectpawsspa.example',
  hours = '{
    "monday": {"open": "08:00", "close": "16:00"},
    "tuesday": {"open": "08:00", "close": "16:00"},
    "wednesday": {"open": "08:00", "close": "16:00"},
    "thursday": {"open": "08:00", "close": "16:00"},
    "friday": {"open": "08:00", "close": "16:00"},
    "saturday": null,
    "sunday": null
  }'::jsonb
where name = 'Purrfect Paws Spa';
