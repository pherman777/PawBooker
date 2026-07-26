-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run

-- A user can have more than one device, so this isn't keyed by user_id alone.
create table if not exists push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  token text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists push_tokens_user_id_idx on push_tokens (user_id);

alter table push_tokens enable row level security;

create policy "Users manage their own push tokens" on push_tokens
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- A single device's token needs to be reassignable to whoever is currently
-- signed in on it (e.g. two family members testing on the same phone), which
-- a plain client-side upsert can't do once RLS would otherwise block updating
-- a row still owned by the previous user.
create or replace function register_push_token(p_token text) returns void as $$
begin
  delete from push_tokens where token = p_token and user_id <> auth.uid();
  insert into push_tokens (user_id, token) values (auth.uid(), p_token)
  on conflict (token) do update set user_id = excluded.user_id;
end;
$$ language plpgsql security definer;

grant execute on function register_push_token(text) to authenticated;
