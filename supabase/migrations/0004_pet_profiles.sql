-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run

alter table pets
  add column if not exists photo_path text;

create table if not exists pet_documents (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references pets (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  label text not null,
  storage_path text not null,
  mime_type text,
  created_at timestamptz not null default now()
);

alter table pet_documents enable row level security;

create policy "Users manage their own pet documents" on pet_documents
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- Storage buckets for pet photos and documents (private; access via signed URLs).
insert into storage.buckets (id, name, public)
values ('pet-photos', 'pet-photos', false), ('pet-documents', 'pet-documents', false)
on conflict (id) do nothing;

create policy "Users manage their own pet photos" on storage.objects
  for all using (bucket_id = 'pet-photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'pet-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users manage their own pet document files" on storage.objects
  for all using (bucket_id = 'pet-documents' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'pet-documents' and (storage.foldername(name))[1] = auth.uid()::text);

-- Deleting a pet used to cascade-delete its booking history. Now that pet deletion
-- is a real feature, block deleting a pet that still has bookings instead of
-- silently wiping them.
alter table bookings drop constraint if exists bookings_pet_id_fkey;
alter table bookings
  add constraint bookings_pet_id_fkey foreign key (pet_id) references pets (id) on delete restrict;
