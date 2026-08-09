-- Acquisition fees: the platform takes 5% of the first booking (pre-tax, minus
-- tip - tips are a separate charge) for a customer a groomer gained through the
-- app's Browse/search. Customers a groomer brings in with their personal invite
-- code are exempt, and Pro groomers are exempt entirely.

-- Per (groomer, customer) attribution ledger.
--   origin 'search'   -> found via the app -> fee applies on first booking
--   origin 'referral' -> groomer's own customer via invite code -> never a fee
--   acquisition_settled -> the first booking has completed; the acquisition
--     window is closed regardless of how it resolved (charged / waived by Pro /
--     waived by referral), so a later Pro->Free downgrade can't re-trigger it.
create table if not exists groomer_customers (
  groomer_id uuid not null references groomers (id) on delete cascade,
  customer_id uuid not null references auth.users (id) on delete cascade,
  origin text not null default 'search' check (origin in ('search', 'referral')),
  acquisition_settled boolean not null default false,
  acquisition_fee_cents integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (groomer_id, customer_id)
);

alter table groomer_customers enable row level security;

create policy "Groomers view their own customer links" on groomer_customers
  for select to authenticated
  using (exists (select 1 from groomers g where g.id = groomer_customers.groomer_id and g.user_id = auth.uid()));

create policy "Customers view their own groomer links" on groomer_customers
  for select to authenticated
  using (customer_id = auth.uid());
-- All writes go through the service role (booking trigger + edge functions);
-- there is deliberately no client write policy.

-- Personal invite code per salon.
alter table groomers add column if not exists invite_code text;
create unique index if not exists groomers_invite_code_key on groomers (invite_code) where invite_code is not null;

create or replace function set_groomer_invite_code()
returns trigger language plpgsql as $$
begin
  if new.invite_code is null then
    new.invite_code := upper(substr(md5(gen_random_uuid()::text), 1, 8));
  end if;
  return new;
end;
$$;

create trigger groomers_set_invite_code
  before insert on groomers
  for each row execute function set_groomer_invite_code();

-- Backfill existing salons.
update groomers set invite_code = upper(substr(md5(gen_random_uuid()::text || id::text), 1, 8))
where invite_code is null;

-- Every new booking ensures an attribution row exists. If a referral row was
-- already created (invite redeemed first), the conflict leaves it untouched;
-- otherwise the pairing defaults to 'search'.
create or replace function attribute_booking_customer()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into groomer_customers (groomer_id, customer_id, origin)
  values (new.groomer_id, new.customer_id, 'search')
  on conflict (groomer_id, customer_id) do nothing;
  return new;
end;
$$;

create trigger bookings_attribute_customer
  after insert on bookings
  for each row execute function attribute_booking_customer();

-- Any (groomer, customer) pairing that already has bookings predates acquisition
-- tracking - treat it as an existing relationship (referral, already settled) so
-- no fee is ever charged retroactively on a customer the groomer already had.
insert into groomer_customers (groomer_id, customer_id, origin, acquisition_settled)
select distinct groomer_id, customer_id, 'referral', true
from bookings
on conflict (groomer_id, customer_id) do nothing;
