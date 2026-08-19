-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run
--
-- Storage for the groomer's business photo (shown to customers on their
-- profile, and in the dashboard nav). Public, unlike pet-photos/
-- pet-documents in 0004_pet_profiles.sql (those are private with signed
-- URLs) - this one is meant to be publicly visible, so a stable public URL
-- is simpler and needs no signed-URL refresh logic.
--
-- Path convention mirrors 0004's: `${auth.uid()}/avatar.<ext>` - the RLS
-- policy checks the first folder segment against auth.uid(), same pattern
-- as pet-photos.

insert into storage.buckets (id, name, public)
values ('groomer-avatars', 'groomer-avatars', true)
on conflict (id) do nothing;

create policy "Groomers manage their own avatar" on storage.objects
  for all using (bucket_id = 'groomer-avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'groomer-avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Anyone can view groomer avatars" on storage.objects
  for select using (bucket_id = 'groomer-avatars');
