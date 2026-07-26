-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run

create table if not exists customer_billing (
  user_id uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id text not null,
  default_payment_method_id text not null,
  card_brand text,
  card_last4 text,
  updated_at timestamptz not null default now()
);

alter table customer_billing enable row level security;

create policy "Users manage their own billing info" on customer_billing
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table bookings
  add column if not exists payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid', 'paid', 'failed')),
  add column if not exists stripe_payment_intent_id text,
  add column if not exists invoice_total_cents integer,
  add column if not exists invoice_sent_at timestamptz;

create table if not exists booking_line_items (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings (id) on delete cascade,
  description text not null,
  amount_cents integer not null,
  created_at timestamptz not null default now()
);

alter table booking_line_items enable row level security;

-- Customers can view line items on their own bookings.
create policy "Customers view their own booking line items" on booking_line_items
  for select using (
    exists (
      select 1 from bookings
      where bookings.id = booking_line_items.booking_id
      and bookings.customer_id = auth.uid()
    )
  );

-- Groomers manage (view/add/edit/remove) line items for bookings at their salon.
create policy "Groomers manage line items for their salon's bookings" on booking_line_items
  for all using (
    exists (
      select 1 from bookings
      join groomers on groomers.id = bookings.groomer_id
      where bookings.id = booking_line_items.booking_id
      and groomers.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from bookings
      join groomers on groomers.id = bookings.groomer_id
      where bookings.id = booking_line_items.booking_id
      and groomers.user_id = auth.uid()
    )
  );
