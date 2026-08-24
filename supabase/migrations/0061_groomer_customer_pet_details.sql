-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run

-- fetchCustomerPetDetails (services/customers.ts) was querying `pets`
-- directly, relying on the groomer-read policy from 0008_groomer_accounts.sql
-- ("Groomers view pets booked at their salon"). That policy only opens up
-- per pet, once a booking already exists for that specific pet - so a
-- customer linked to a groomer via a redeemed invite code (or a booking for
-- only one of several pets) had pets invisible on the customer detail
-- screen, while the customer list's pet count (groomer_search_customers,
-- 0055) already counts every pet the customer owns, since it's scoped to
-- the groomer_customers link rather than per-pet bookings. The mismatch
-- surfaced as a groomer seeing "5 dogs" on the list but only 1 on the
-- detail screen.
--
-- This RPC gives the detail screen the same groomer_customers-scoped access
-- as the search RPC, so the two screens agree.
create or replace function groomer_customer_pet_details(p_customer_id uuid)
returns table (
  id uuid,
  name text,
  species text,
  breed text,
  color text,
  weight_lbs numeric,
  is_microchipped boolean,
  microchip_number text,
  vet_name text,
  vet_phone text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.name, p.species, p.breed, p.color, p.weight_lbs,
         p.is_microchipped, p.microchip_number, p.vet_name, p.vet_phone
  from pets p
  where p.owner_id = p_customer_id
    and exists (
      select 1 from groomer_customers gc
      join groomers g on g.id = gc.groomer_id
      where gc.customer_id = p_customer_id
      and g.user_id = auth.uid()
    )
  order by p.name;
$$;

grant execute on function groomer_customer_pet_details(uuid) to authenticated;
