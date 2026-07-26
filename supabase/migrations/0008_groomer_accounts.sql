-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run

alter table groomers
  add column if not exists user_id uuid references auth.users (id) on delete set null;

create unique index if not exists groomers_user_id_key on groomers (user_id) where user_id is not null;

-- Groomers can see bookings made at their own salon (in addition to the existing
-- "Users manage their own bookings" policy, which covers the customer side).
create policy "Groomers view bookings for their salon" on bookings
  for select using (
    exists (
      select 1 from groomers
      where groomers.id = bookings.groomer_id
      and groomers.user_id = auth.uid()
    )
  );

-- Groomers can update (e.g. accept/cancel) bookings made at their own salon.
create policy "Groomers manage bookings for their salon" on bookings
  for update using (
    exists (
      select 1 from groomers
      where groomers.id = bookings.groomer_id
      and groomers.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from groomers
      where groomers.id = bookings.groomer_id
      and groomers.user_id = auth.uid()
    )
  );

-- Groomers can see basic info for pets booked at their salon, so they know who
-- the appointment is for (this does not grant access to pet documents).
create policy "Groomers view pets booked at their salon" on pets
  for select using (
    exists (
      select 1 from bookings
      join groomers on groomers.id = bookings.groomer_id
      where bookings.pet_id = pets.id
      and groomers.user_id = auth.uid()
    )
  );
