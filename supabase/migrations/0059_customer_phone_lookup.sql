-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run

-- Extend groomer_search_customers (0055, extended for name in 0057) to also
-- return phone, for the new customer list/detail screens. Drop first: adding
-- an OUT column changes the function's return row type.
drop function if exists groomer_search_customers(text);

create function groomer_search_customers(p_search text)
returns table (
  customer_id uuid,
  email text,
  name text,
  phone text,
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
    pr.phone,
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
    and (p_search = '' or u.email ilike '%' || p_search || '%' or pr.name ilike '%' || p_search || '%')
  order by u.email, p.name;
$$;

grant execute on function groomer_search_customers(text) to authenticated;
