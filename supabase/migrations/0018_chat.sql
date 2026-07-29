-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run

-- One schema shared by both the groomer bot (per customer/groomer pair) and,
-- later, a general app-support bot (per customer, no groomer). `needs_human`
-- flips true when the bot escalates, so the groomer knows to jump in.
create table if not exists chat_threads (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users (id) on delete cascade,
  groomer_id uuid references groomers (id) on delete cascade,
  thread_type text not null check (thread_type in ('groomer', 'app_support')),
  needs_human boolean not null default false,
  customer_last_read_at timestamptz,
  groomer_last_read_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists chat_threads_customer_groomer_key
  on chat_threads (customer_id, groomer_id)
  where thread_type = 'groomer';

create unique index if not exists chat_threads_customer_app_support_key
  on chat_threads (customer_id)
  where thread_type = 'app_support';

create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references chat_threads (id) on delete cascade,
  sender_type text not null check (sender_type in ('customer', 'groomer', 'bot')),
  sender_id uuid references auth.users (id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_thread_id_idx on chat_messages (thread_id, created_at);

alter table chat_threads enable row level security;
alter table chat_messages enable row level security;

create policy "Customers view their own threads" on chat_threads
  for select using (auth.uid() = customer_id);

create policy "Customers create their own threads" on chat_threads
  for insert with check (auth.uid() = customer_id);

create policy "Customers update their own threads" on chat_threads
  for update using (auth.uid() = customer_id) with check (auth.uid() = customer_id);

create policy "Groomers view their salon threads" on chat_threads
  for select using (
    exists (
      select 1 from groomers
      where groomers.id = chat_threads.groomer_id
      and groomers.user_id = auth.uid()
    )
  );

create policy "Groomers update their salon threads" on chat_threads
  for update using (
    exists (
      select 1 from groomers
      where groomers.id = chat_threads.groomer_id
      and groomers.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from groomers
      where groomers.id = chat_threads.groomer_id
      and groomers.user_id = auth.uid()
    )
  );

-- Bot-authored messages are only ever inserted by the chat-agent edge
-- function using the service role key, which bypasses RLS entirely - these
-- policies intentionally only ever permit 'customer' or 'groomer' senders.
create policy "Customers view messages in their threads" on chat_messages
  for select using (
    exists (
      select 1 from chat_threads
      where chat_threads.id = chat_messages.thread_id
      and chat_threads.customer_id = auth.uid()
    )
  );

create policy "Customers send messages in their threads" on chat_messages
  for insert with check (
    sender_type = 'customer'
    and sender_id = auth.uid()
    and exists (
      select 1 from chat_threads
      where chat_threads.id = chat_messages.thread_id
      and chat_threads.customer_id = auth.uid()
    )
  );

create policy "Groomers view messages in their salon threads" on chat_messages
  for select using (
    exists (
      select 1 from chat_threads
      join groomers on groomers.id = chat_threads.groomer_id
      where chat_threads.id = chat_messages.thread_id
      and groomers.user_id = auth.uid()
    )
  );

create policy "Groomers send messages in their salon threads" on chat_messages
  for insert with check (
    sender_type = 'groomer'
    and sender_id = auth.uid()
    and exists (
      select 1 from chat_threads
      join groomers on groomers.id = chat_threads.groomer_id
      where chat_threads.id = chat_messages.thread_id
      and groomers.user_id = auth.uid()
    )
  );
