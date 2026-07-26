-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run

create policy "Groomers delete their own notifications" on groomer_notifications
  for delete using (
    exists (
      select 1 from groomers
      where groomers.id = groomer_notifications.groomer_id
      and groomers.user_id = auth.uid()
    )
  );
