-- One-off closed dates (holidays, vacation, sick days) layered on top of a
-- groomer's recurring weekly hours (groomers.hours). Any date whose calendar
-- day falls within [start_date, end_date] of a row here is fully closed for
-- that groomer, regardless of what the weekly schedule says for that
-- weekday - checked everywhere availability is computed (booking screen,
-- chat-agent's check_availability/create_booking/reschedule_booking,
-- business-assistant's propose_reschedule).

create table if not exists groomer_closures (
  id uuid primary key default gen_random_uuid(),
  groomer_id uuid not null references groomers (id) on delete cascade,
  start_date date not null,
  end_date date not null,
  note text,
  created_at timestamptz not null default now(),
  constraint groomer_closures_date_order check (end_date >= start_date)
);

create index if not exists groomer_closures_groomer_id_idx on groomer_closures (groomer_id, start_date, end_date);

alter table groomer_closures enable row level security;

-- Public, same as salon_staff/groomer_services - a customer needs to see a
-- salon's closures before/while booking, not just the groomer themselves.
drop policy if exists "Salon closures are publicly readable" on groomer_closures;
create policy "Salon closures are publicly readable" on groomer_closures
  for select
  using (true);

drop policy if exists "Groomers manage their own closures" on groomer_closures;
create policy "Groomers manage their own closures" on groomer_closures
  for all to authenticated
  using (exists (select 1 from groomers g where g.id = groomer_closures.groomer_id and g.user_id = auth.uid()))
  with check (exists (select 1 from groomers g where g.id = groomer_closures.groomer_id and g.user_id = auth.uid()));
