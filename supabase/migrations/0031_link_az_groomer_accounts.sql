-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run
--
-- Links auth accounts (created via Authentication -> Users) to the Maricopa,
-- AZ dummy groomers so those accounts log into the groomer dashboard.

update groomers set user_id = (select id from auth.users where email = 'bubblesandbows.az@pawbooker-demo.com')
  where name = 'Bubbles & Bows Grooming' and state = 'AZ';

update groomers set user_id = (select id from auth.users where email = 'dapperdog.az@pawbooker-demo.com')
  where name = 'The Dapper Dog' and state = 'AZ';

update groomers set user_id = (select id from auth.users where email = 'purrfectpaws.az@pawbooker-demo.com')
  where name = 'Purrfect Paws Spa' and state = 'AZ';
