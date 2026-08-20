-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run

-- Groomers could only ever REPLY inside a chat_threads row a customer had
-- already created (chat_threads' only insert policy was "Customers create
-- their own threads") - there was no way for a groomer to message a
-- customer first. Real gap: a groomer wanting to follow up after a
-- cancellation, a no-show, or just to check in had no in-app way to do it.
--
-- Scoped the same way the Customers list / groomer_search_customers already
-- is (0055) - a groomer can only start a thread with a customer they have a
-- real link to (a booking or a redeemed invite code), never an arbitrary
-- customer_id.
create policy "Groomers create threads with their own customers" on chat_threads
  for insert
  with check (
    thread_type = 'groomer'
    and exists (
      select 1 from groomers g
      where g.id = chat_threads.groomer_id
      and g.user_id = auth.uid()
    )
    and exists (
      select 1 from groomer_customers gc
      where gc.groomer_id = chat_threads.groomer_id
      and gc.customer_id = chat_threads.customer_id
    )
  );
