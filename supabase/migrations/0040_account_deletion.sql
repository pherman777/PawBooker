-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run
--
-- Supports account deletion (Apple 5.1.1(v) / Google Play account deletion
-- requirements). When a customer deletes their account, most of their data
-- cascade-deletes as already configured (pets, saved payment methods, chat,
-- reviews of the app itself, win-back reminders). But bookings and salon
-- reviews are a groomer's own transaction/reputation history, not just the
-- customer's data - so instead of cascading away, they're anonymized:
-- customer_id/pet_id are set to null (preserving the service, date, and
-- invoice/tax figures the groomer's Insights and accounting rely on), and
-- the delete-account function separately blanks bookings.customer_email
-- before deleting the auth user.

alter table bookings alter column customer_id drop not null;
alter table bookings drop constraint bookings_customer_id_fkey;
alter table bookings add constraint bookings_customer_id_fkey
  foreign key (customer_id) references auth.users (id) on delete set null;

-- pets cascade-delete when their owner's auth user is deleted (see
-- 0003_pets_and_bookings.sql) - bookings.pet_id must not cascade with them,
-- or the anonymized booking row above would be deleted right back out from
-- under this same migration's intent.
alter table bookings alter column pet_id drop not null;
alter table bookings drop constraint bookings_pet_id_fkey;
alter table bookings add constraint bookings_pet_id_fkey
  foreign key (pet_id) references pets (id) on delete set null;

alter table salon_reviews alter column customer_id drop not null;
alter table salon_reviews drop constraint salon_reviews_customer_id_fkey;
alter table salon_reviews add constraint salon_reviews_customer_id_fkey
  foreign key (customer_id) references auth.users (id) on delete set null;

-- groomers.user_id already sets null (not cascade) when its auth user is
-- deleted - that's right for preserving customer-facing booking/review
-- history, but on its own it leaves a live, bookable salon listing behind
-- with no owner who can ever respond. deactivated_at lets delete-account
-- mark the listing dead without touching any of that historical data.
alter table groomers add column if not exists deactivated_at timestamptz;
