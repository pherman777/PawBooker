-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run

-- Extend the welcome-message trigger (defined in 0022) to also greet
-- app_support threads. Unlike the groomer bot, this one is always available -
-- it isn't gated behind any groomer's Pro plan.
create or replace function insert_chat_welcome_message() returns trigger as $$
declare
  groomer_name text;
  groomer_plan text;
begin
  if new.thread_type = 'groomer' then
    select name, plan into groomer_name, groomer_plan from groomers where id = new.groomer_id;

    if groomer_plan = 'pro' then
      insert into chat_messages (thread_id, sender_type, body)
      values (
        new.id,
        'bot',
        'Hi! I''m the booking assistant for ' || coalesce(groomer_name, 'this salon') ||
        '. I can answer questions about your appointments, services, or hours, and I can reschedule or cancel a booking for you. What can I help with?'
      );
    end if;
  elsif new.thread_type = 'app_support' then
    insert into chat_messages (thread_id, sender_type, body)
    values (
      new.id,
      'bot',
      'Hi! I''m the PawBooker support assistant. I can help with questions about how the app works. For anything bigger, I''ll loop in our team directly. What can I help with?'
    );
  end if;
  return new;
end;
$$ language plpgsql security definer;

-- Structured reports (abuse, non-payment, no-shows, etc.) tied to a specific
-- booking, reviewed by the PawBooker admin directly (no in-app admin UI yet -
-- reviewed via the Supabase dashboard).
create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users (id) on delete cascade,
  reported_user_id uuid references auth.users (id) on delete set null,
  booking_id uuid references bookings (id) on delete set null,
  reason text not null,
  details text,
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  created_at timestamptz not null default now()
);

alter table reports enable row level security;

create policy "Users can submit their own reports" on reports
  for insert with check (auth.uid() = reporter_id);
