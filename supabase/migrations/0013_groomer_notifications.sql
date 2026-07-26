-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run

create table if not exists groomer_notifications (
  id uuid primary key default gen_random_uuid(),
  groomer_id uuid not null references groomers (id) on delete cascade,
  booking_id uuid not null references bookings (id) on delete cascade,
  type text not null check (type in ('booking_requested', 'booking_cancelled')),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

alter table groomer_notifications enable row level security;

create policy "Groomers view their own notifications" on groomer_notifications
  for select using (
    exists (
      select 1 from groomers
      where groomers.id = groomer_notifications.groomer_id
      and groomers.user_id = auth.uid()
    )
  );

create policy "Groomers mark their own notifications read" on groomer_notifications
  for update using (
    exists (
      select 1 from groomers
      where groomers.id = groomer_notifications.groomer_id
      and groomers.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from groomers
      where groomers.id = groomer_notifications.groomer_id
      and groomers.user_id = auth.uid()
    )
  );

-- A customer can only create a notification tied to their own booking, and only
-- for the groomer that booking actually belongs to.
create policy "Customers create notifications for their own booking events" on groomer_notifications
  for insert with check (
    exists (
      select 1 from bookings
      where bookings.id = groomer_notifications.booking_id
      and bookings.customer_id = auth.uid()
      and bookings.groomer_id = groomer_notifications.groomer_id
    )
  );
