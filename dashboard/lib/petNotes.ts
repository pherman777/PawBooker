import { supabase } from '@/lib/supabase';

// Private grooming notes (blade/guard, temperament) a groomer keeps on a
// pet - per salon, never visible to the client. See migration 0062 for the
// RLS boundary; there's no owner-read policy at all, so this is invisible
// to the customer regardless of what the app does.
export async function fetchPetNotes(groomerId: string, petIds: string[]): Promise<Record<string, string>> {
  if (petIds.length === 0) return {};
  const { data, error } = await supabase
    .from('groomer_pet_notes')
    .select('pet_id, notes')
    .eq('groomer_id', groomerId)
    .in('pet_id', petIds);
  if (error) throw error;

  const notes: Record<string, string> = {};
  for (const row of data ?? []) notes[row.pet_id] = row.notes;
  return notes;
}

// One editable note per (groomer, pet) - overwrites in place, so updating a
// pet's clipper guard from a 4 to a 7 just means rewriting the note, not
// appending a new entry on top of the old one.
export async function savePetNote(groomerId: string, petId: string, notes: string): Promise<void> {
  const { error } = await supabase
    .from('groomer_pet_notes')
    .upsert({ groomer_id: groomerId, pet_id: petId, notes, updated_at: new Date().toISOString() });
  if (error) throw error;
}
