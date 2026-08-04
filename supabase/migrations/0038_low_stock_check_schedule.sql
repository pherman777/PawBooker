-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run
--
-- Daily scheduled check for supplies at or below their reorder threshold,
-- run via pg_cron + pg_net calling the check-low-stock edge function.
-- Reuses the same Vault secrets ('project_url', 'service_role_key') and
-- pg_cron/pg_net extensions already set up in migration 0036 - if this is
-- being run on a fresh project without 0036 applied first, see that file
-- for the one-time `vault.create_secret(...)` setup step.

select cron.schedule(
  'daily-low-stock-check',
  '0 15 * * *', -- 15:00 UTC daily, offset from the lapsed-customer check
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/check-low-stock',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
