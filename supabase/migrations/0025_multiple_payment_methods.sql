-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run

create table if not exists customer_payment_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  stripe_customer_id text not null,
  stripe_payment_method_id text not null unique,
  card_brand text,
  card_last4 text,
  wallet_type text,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

alter table customer_payment_methods enable row level security;

create policy "Users manage their own payment methods" on customer_payment_methods
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Keeps customer_billing (read by every charge function) pointed at whichever
-- payment method is currently the default, so existing booking/tip/subscription
-- charge code doesn't need to change to support multiple saved methods.
create or replace function sync_default_payment_method()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_default then
    update customer_payment_methods
      set is_default = false
      where user_id = new.user_id and id <> new.id and is_default = true;

    insert into customer_billing (user_id, stripe_customer_id, default_payment_method_id, card_brand, card_last4, updated_at)
      values (new.user_id, new.stripe_customer_id, new.stripe_payment_method_id, new.card_brand, new.card_last4, now())
      on conflict (user_id) do update set
        stripe_customer_id = excluded.stripe_customer_id,
        default_payment_method_id = excluded.default_payment_method_id,
        card_brand = excluded.card_brand,
        card_last4 = excluded.card_last4,
        updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists customer_payment_methods_sync_default on customer_payment_methods;
create trigger customer_payment_methods_sync_default
  after insert or update of is_default on customer_payment_methods
  for each row
  execute function sync_default_payment_method();

-- If the default method is removed, promote the most recently added
-- remaining method to default; if none remain, clear customer_billing.
create or replace function handle_payment_method_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  next_method customer_payment_methods%rowtype;
begin
  if old.is_default then
    select * into next_method from customer_payment_methods
      where user_id = old.user_id
      order by created_at desc
      limit 1;

    if found then
      update customer_payment_methods set is_default = true where id = next_method.id;
    else
      delete from customer_billing where user_id = old.user_id;
    end if;
  end if;
  return old;
end;
$$;

drop trigger if exists customer_payment_methods_after_delete on customer_payment_methods;
create trigger customer_payment_methods_after_delete
  after delete on customer_payment_methods
  for each row
  execute function handle_payment_method_delete();

-- Backfill: carry over each customer's existing single saved card as their
-- first default payment method under the new multi-method schema.
insert into customer_payment_methods (user_id, stripe_customer_id, stripe_payment_method_id, card_brand, card_last4, is_default, created_at)
select user_id, stripe_customer_id, default_payment_method_id, card_brand, card_last4, true, updated_at
from customer_billing
on conflict (stripe_payment_method_id) do nothing;
