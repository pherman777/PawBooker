-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run

-- Separate from chat_threads/chat_messages on purpose: those tables' RLS is
-- built around the customer/groomer dyad (unique constraints, sender-identity
-- checks tied to that pairing). This is a groomer talking to a read-only
-- assistant about their own business data - a different shape entirely.
create table if not exists business_assistant_messages (
  id uuid primary key default gen_random_uuid(),
  groomer_id uuid not null references groomers (id) on delete cascade,
  sender_type text not null check (sender_type in ('groomer', 'bot')),
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists business_assistant_messages_groomer_id_idx
  on business_assistant_messages (groomer_id, created_at);

alter table business_assistant_messages enable row level security;

create policy "Groomers view their own assistant messages" on business_assistant_messages
  for select using (
    exists (
      select 1 from groomers
      where groomers.id = business_assistant_messages.groomer_id
      and groomers.user_id = auth.uid()
    )
  );

-- Bot-authored messages are only ever inserted by the business-assistant edge
-- function using the service role key, which bypasses RLS - this policy
-- intentionally only ever permits a 'groomer' sender.
create policy "Groomers send their own assistant messages" on business_assistant_messages
  for insert with check (
    sender_type = 'groomer'
    and exists (
      select 1 from groomers
      where groomers.id = business_assistant_messages.groomer_id
      and groomers.user_id = auth.uid()
    )
  );
