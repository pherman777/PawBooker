-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run

create table if not exists customer_reminders (
  id uuid primary key default gen_random_uuid(),
  groomer_id uuid not null references groomers (id) on delete cascade,
  customer_id uuid not null references auth.users (id) on delete cascade,
  customer_email text not null,
  last_booking_at timestamptz not null,
  draft_subject text not null,
  draft_body text not null,
  status text not null default 'draft' check (status in ('draft', 'sent', 'dismissed')),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

-- Only one open draft per groomer/customer pair at a time, so the daily check
-- doesn't redraft someone who already has one waiting for review.
create unique index if not exists customer_reminders_one_open_draft
  on customer_reminders (groomer_id, customer_id)
  where status = 'draft';

alter table customer_reminders enable row level security;

create policy "Groomers view their own customer reminders" on customer_reminders
  for select using (
    exists (
      select 1 from groomers
      where groomers.id = customer_reminders.groomer_id
      and groomers.user_id = auth.uid()
    )
  );

-- Groomers can edit a draft's text or dismiss it, but can never set status to
-- 'sent' themselves - only the send-customer-reminder function (service role,
-- after it actually calls Resend) is allowed to do that.
create policy "Groomers edit or dismiss their own draft reminders" on customer_reminders
  for update using (
    exists (
      select 1 from groomers
      where groomers.id = customer_reminders.groomer_id
      and groomers.user_id = auth.uid()
    )
  )
  with check (
    status in ('draft', 'dismissed')
    and exists (
      select 1 from groomers
      where groomers.id = customer_reminders.groomer_id
      and groomers.user_id = auth.uid()
    )
  );

-- No insert policy: rows are only ever created by check-lapsed-customers via
-- the service role client, which bypasses RLS.

-- Daily scheduled check for customers who haven't booked in a while, run via
-- pg_cron + pg_net calling the check-lapsed-customers edge function. Requires
-- a one-time manual setup step (do NOT commit real secret values to git):
--
--   select vault.create_secret('https://<your-project-ref>.supabase.co', 'project_url');
--   select vault.create_secret('<your-service-role-key>', 'service_role_key');
--
-- The edge function itself checks the Authorization header against
-- SUPABASE_SERVICE_ROLE_KEY, so only this scheduled call (or another caller
-- who already has the service role key) can trigger it - the public anon key
-- is not sufficient, even though it also passes Supabase's JWT verification.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'daily-lapsed-customer-check',
  '0 14 * * *', -- 14:00 UTC daily; adjust to whenever most groomers are asleep in their own timezone
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/check-lapsed-customers',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
