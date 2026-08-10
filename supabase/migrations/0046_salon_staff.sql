-- Individual groomers (staff) within a salon, so a customer can request a
-- specific groomer and only see that groomer's open times. A salon with no staff
-- rows behaves as a single-groomer shop.

create table if not exists salon_staff (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references groomers (id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists salon_staff_salon_id_idx on salon_staff (salon_id);

alter table salon_staff enable row level security;

-- Drop-then-create so this migration is safe to re-run even if an earlier version
-- of this feature already created these policies.
drop policy if exists "Salon staff are publicly readable" on salon_staff;
create policy "Salon staff are publicly readable" on salon_staff
  for select
  using (true);

drop policy if exists "Groomers manage their own staff" on salon_staff;
create policy "Groomers manage their own staff" on salon_staff
  for all to authenticated
  using (exists (select 1 from groomers g where g.id = salon_staff.salon_id and g.user_id = auth.uid()))
  with check (exists (select 1 from groomers g where g.id = salon_staff.salon_id and g.user_id = auth.uid()));

-- Which groomer an appointment is with. Null = "any / first available".
alter table bookings
  add column if not exists staff_id uuid references salon_staff (id) on delete set null;

-- Availability needs a salon's booked times, but customers can only read their
-- own bookings under RLS. This SECURITY DEFINER function exposes just the busy
-- intervals (start, length, which groomer) for a salon over a date range - no
-- customer identity or booking details - so the client can compute open slots.
create or replace function salon_busy_intervals(
  p_salon_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns table (starts_at timestamptz, duration_minutes int, staff_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select b.starts_at, s.duration_minutes, b.staff_id
  from bookings b
  join groomer_services s on s.id = b.service_id
  where b.groomer_id = p_salon_id
    and b.status in ('pending', 'confirmed')
    and b.starts_at >= p_from
    and b.starts_at < p_to;
$$;

grant execute on function salon_busy_intervals(uuid, timestamptz, timestamptz) to authenticated;
