-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run

-- Customer's own display name, self-entered (mirrors profiles.phone).
alter table profiles add column if not exists name text;

-- Denormalized onto bookings at creation time, the same way customer_email
-- already is (0009_booking_cancellation_and_email.sql): a groomer has no
-- RLS-visible path to another user's profile, and copying the name onto
-- each booking row is simpler than opening that up. Lets a groomer tell
-- apart two customers whose pets happen to share a name.
alter table bookings add column if not exists customer_name text;

-- Extend groomer_search_customers (0055) to also return and search by name,
-- for the same reason. Drop first: adding an OUT column changes the
-- function's return row type, which create-or-replace can't do in place.
drop function if exists groomer_search_customers(text);

create function groomer_search_customers(p_search text)
returns table (
  customer_id uuid,
  email text,
  name text,
  pet_id uuid,
  pet_name text,
  pet_species text,
  pet_breed text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    gc.customer_id,
    u.email,
    pr.name,
    p.id as pet_id,
    p.name as pet_name,
    p.species as pet_species,
    p.breed as pet_breed
  from groomer_customers gc
  join groomers g on g.id = gc.groomer_id
  join auth.users u on u.id = gc.customer_id
  left join profiles pr on pr.user_id = gc.customer_id
  left join pets p on p.owner_id = gc.customer_id
  where g.user_id = auth.uid()
    and (u.email ilike '%' || p_search || '%' or pr.name ilike '%' || p_search || '%')
  order by u.email, p.name;
$$;

grant execute on function groomer_search_customers(text) to authenticated;
