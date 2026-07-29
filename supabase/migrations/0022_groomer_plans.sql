-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run

alter table groomers
  add column if not exists plan text not null default 'free' check (plan in ('free', 'pro')),
  add column if not exists stripe_subscription_id text,
  add column if not exists plan_current_period_end timestamptz;

-- Free-tier groomers don't get the AI assistant, so there's no bot to greet
-- with - the thread just starts empty and behaves as plain messaging.
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
  end if;
  return new;
end;
$$ language plpgsql security definer;
