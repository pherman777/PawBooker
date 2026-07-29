-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run
--
-- Generic rate limiter for edge functions. Backed by Postgres (not in-memory)
-- since edge functions are stateless/distributed - a counter needs to live
-- somewhere durable to be checked atomically across invocations.

create table if not exists rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  count integer not null default 0
);

alter table rate_limits enable row level security;
-- No policies: this is internal bookkeeping only ever touched by the
-- SECURITY DEFINER function below (granted to service_role only), never
-- directly by client roles.

create or replace function check_rate_limit(p_key text, p_max_count integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_count integer;
begin
  insert into rate_limits (key, window_start, count)
  values (p_key, now(), 1)
  on conflict (key) do update set
    window_start = case
      when rate_limits.window_start < now() - make_interval(secs => p_window_seconds) then now()
      else rate_limits.window_start
    end,
    count = case
      when rate_limits.window_start < now() - make_interval(secs => p_window_seconds) then 1
      else rate_limits.count + 1
    end
  returning count into current_count;

  return current_count <= p_max_count;
end;
$$;

revoke execute on function check_rate_limit(text, integer, integer) from public;
revoke execute on function check_rate_limit(text, integer, integer) from authenticated;
grant execute on function check_rate_limit(text, integer, integer) to service_role;
