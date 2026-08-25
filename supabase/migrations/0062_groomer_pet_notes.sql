-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run

-- Private grooming notes a groomer keeps on a pet (blade/guard used,
-- temperament, etc) - per salon, not per pet globally, so a note from one
-- groomer never follows the pet to a different salon it also visits.
-- Deliberately has NO policy granting the customer (pet owner) any access -
-- RLS defaults to deny, so this is invisible to the client no matter what,
-- unlike `pets` itself which the owner fully controls.
create table if not exists groomer_pet_notes (
  groomer_id uuid not null references groomers (id) on delete cascade,
  pet_id uuid not null references pets (id) on delete cascade,
  notes text not null default '',
  updated_at timestamptz not null default now(),
  primary key (groomer_id, pet_id)
);

alter table groomer_pet_notes enable row level security;

create policy "Groomers manage their own pet notes" on groomer_pet_notes
  for all using (
    exists (select 1 from groomers g where g.id = groomer_pet_notes.groomer_id and g.user_id = auth.uid())
  )
  with check (
    exists (select 1 from groomers g where g.id = groomer_pet_notes.groomer_id and g.user_id = auth.uid())
  );
