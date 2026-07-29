-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run

create policy "Customers delete their own threads" on chat_threads
  for delete using (auth.uid() = customer_id);

create policy "Groomers delete their salon threads" on chat_threads
  for delete using (
    exists (
      select 1 from groomers
      where groomers.id = chat_threads.groomer_id
      and groomers.user_id = auth.uid()
    )
  );
