-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run

-- Greets the customer as soon as a new groomer chat thread is created, so
-- they aren't left staring at a blank screen before typing anything. This is
-- a static message (no Claude API call) purely to set expectations.
create or replace function insert_chat_welcome_message() returns trigger as $$
declare
  groomer_name text;
begin
  if new.thread_type = 'groomer' then
    select name into groomer_name from groomers where id = new.groomer_id;

    insert into chat_messages (thread_id, sender_type, body)
    values (
      new.id,
      'bot',
      'Hi! I''m the booking assistant for ' || coalesce(groomer_name, 'this salon') ||
      '. I can answer questions about your appointments, services, or hours, and I can reschedule or cancel a booking for you. What can I help with?'
    );
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists chat_threads_welcome_message on chat_threads;
create trigger chat_threads_welcome_message
  after insert on chat_threads
  for each row execute function insert_chat_welcome_message();
