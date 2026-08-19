-- Lets a groomer search customers already linked to them (via
-- groomer_customers - a redeemed invite code, or a past booking) by email,
-- for the manual-booking flow: a customer calls/walks in wanting a slot the
-- self-service booking flow doesn't show as open, and the groomer needs a
-- way to find them and book directly.
--
-- SECURITY DEFINER, mirroring salon_busy_intervals's pattern
-- (0046_salon_staff.sql): a groomer otherwise has no RLS-visible path to
-- another user's email, and pets' own groomer-read policy only opens up
-- once a booking already exists at that salon (0008_groomer_accounts.sql) -
-- exactly the gap this closes. Scoped strictly to the caller's own
-- groomer_customers rows (g.user_id = auth.uid()), the same boundary
-- groomer_customers' own RLS already enforces - never exposes anything
-- about a customer beyond their own already-self-entered email and pets.
create or replace function groomer_search_customers(p_search text)
returns table (
  customer_id uuid,
  email text,
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
    p.id as pet_id,
    p.name as pet_name,
    p.species as pet_species,
    p.breed as pet_breed
  from groomer_customers gc
  join groomers g on g.id = gc.groomer_id
  join auth.users u on u.id = gc.customer_id
  left join pets p on p.owner_id = gc.customer_id
  where g.user_id = auth.uid()
    and u.email ilike '%' || p_search || '%'
  order by u.email, p.name;
$$;

grant execute on function groomer_search_customers(text) to authenticated;
