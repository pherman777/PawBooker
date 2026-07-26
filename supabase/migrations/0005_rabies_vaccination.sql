-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run

alter table pet_documents
  add column if not exists document_type text not null default 'other'
    check (document_type in ('rabies_vaccination', 'other')),
  add column if not exists expires_at date;
