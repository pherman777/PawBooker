-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run

create table if not exists salon_reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references bookings (id) on delete cascade,
  groomer_id uuid not null references groomers (id) on delete cascade,
  customer_id uuid not null references auth.users (id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

alter table salon_reviews enable row level security;

create policy "Salon reviews are publicly readable" on salon_reviews
  for select using (true);

-- A customer may only review their own booking, and only once it's completed.
create policy "Customers review their own completed bookings" on salon_reviews
  for insert with check (
    auth.uid() = customer_id
    and exists (
      select 1 from bookings
      where bookings.id = salon_reviews.booking_id
      and bookings.customer_id = auth.uid()
      and bookings.status = 'completed'
    )
  );

create policy "Customers edit or remove their own review" on salon_reviews
  for update using (auth.uid() = customer_id) with check (auth.uid() = customer_id);

create policy "Customers delete their own review" on salon_reviews
  for delete using (auth.uid() = customer_id);

-- Keep groomers.rating / review_count in sync with real reviews.
create or replace function refresh_groomer_rating() returns trigger as $$
declare
  target_groomer_id uuid;
begin
  target_groomer_id := coalesce(new.groomer_id, old.groomer_id);

  update groomers set
    rating = coalesce((select round(avg(rating)::numeric, 1) from salon_reviews where groomer_id = target_groomer_id), 0),
    review_count = (select count(*) from salon_reviews where groomer_id = target_groomer_id)
  where id = target_groomer_id;

  return null;
end;
$$ language plpgsql security definer;

drop trigger if exists salon_reviews_refresh_rating on salon_reviews;
create trigger salon_reviews_refresh_rating
  after insert or update or delete on salon_reviews
  for each row execute function refresh_groomer_rating();

-- App-wide reviews (of PawBooker itself, not a specific salon). One per customer.
create table if not exists app_reviews (
  customer_id uuid primary key references auth.users (id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table app_reviews enable row level security;

create policy "App reviews are publicly readable" on app_reviews
  for select using (true);

create policy "Customers manage their own app review" on app_reviews
  for all using (auth.uid() = customer_id) with check (auth.uid() = customer_id);
