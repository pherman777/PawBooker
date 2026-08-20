import { customerSupabase } from '@/lib/customerSupabase';

export type PetSpecies = 'dog' | 'cat' | 'other';

export type Pet = {
  id: string;
  ownerId: string;
  name: string;
  species: PetSpecies;
  breed?: string;
  color?: string;
  weightLbs?: number;
  photoPath?: string;
  isMicrochipped?: boolean;
  microchipNumber?: string;
  vetName?: string;
  vetPhone?: string;
};

export type PetDocumentType = 'rabies_vaccination' | 'other';

export type PetDocument = {
  id: string;
  petId: string;
  label: string;
  storagePath: string;
  mimeType?: string;
  documentType: PetDocumentType;
  expiresAt?: string;
  createdAt: string;
};

const PET_COLUMNS =
  'id, owner_id, name, species, breed, color, weight_lbs, photo_path, is_microchipped, microchip_number, vet_name, vet_phone';

function rowToPet(row: Record<string, unknown>): Pet {
  return {
    id: row.id as string,
    ownerId: row.owner_id as string,
    name: row.name as string,
    species: row.species as PetSpecies,
    breed: (row.breed as string | null) ?? undefined,
    color: (row.color as string | null) ?? undefined,
    weightLbs: (row.weight_lbs as number | null) ?? undefined,
    photoPath: (row.photo_path as string | null) ?? undefined,
    isMicrochipped: (row.is_microchipped as boolean | null) ?? false,
    microchipNumber: (row.microchip_number as string | null) ?? undefined,
    vetName: (row.vet_name as string | null) ?? undefined,
    vetPhone: (row.vet_phone as string | null) ?? undefined,
  };
}

export async function fetchPets(ownerId: string): Promise<Pet[]> {
  const { data, error } = await customerSupabase.from('pets').select(PET_COLUMNS).eq('owner_id', ownerId).order('name');
  if (error) throw error;
  return (data ?? []).map(rowToPet);
}

export async function fetchPet(petId: string): Promise<Pet> {
  const { data, error } = await customerSupabase.from('pets').select(PET_COLUMNS).eq('id', petId).single();
  if (error || !data) throw error ?? new Error('Pet not found');
  return rowToPet(data);
}

export type PetFields = {
  name: string;
  species: PetSpecies;
  breed: string | null;
  color: string | null;
  weightLbs: number | null;
  isMicrochipped: boolean;
  microchipNumber: string | null;
  vetName: string | null;
  vetPhone: string | null;
};

export async function createPet(ownerId: string, fields: PetFields): Promise<string> {
  const { data, error } = await customerSupabase
    .from('pets')
    .insert({
      owner_id: ownerId,
      name: fields.name,
      species: fields.species,
      breed: fields.breed,
      color: fields.color,
      weight_lbs: fields.weightLbs,
      is_microchipped: fields.isMicrochipped,
      microchip_number: fields.microchipNumber,
      vet_name: fields.vetName,
      vet_phone: fields.vetPhone,
    })
    .select('id')
    .single();

  if (error || !data) throw error ?? new Error('Something went wrong');
  return data.id;
}

export async function updatePet(petId: string, fields: PetFields): Promise<void> {
  const { error } = await customerSupabase
    .from('pets')
    .update({
      name: fields.name,
      species: fields.species,
      breed: fields.breed,
      color: fields.color,
      weight_lbs: fields.weightLbs,
      is_microchipped: fields.isMicrochipped,
      microchip_number: fields.microchipNumber,
      vet_name: fields.vetName,
      vet_phone: fields.vetPhone,
    })
    .eq('id', petId);
  if (error) throw error;
}

export async function updatePetPhoto(petId: string, photoPath: string): Promise<void> {
  const { error } = await customerSupabase.from('pets').update({ photo_path: photoPath }).eq('id', petId);
  if (error) throw error;
}

// Mirrors app/pet/[id].tsx's handleDeletePet - refuses to delete a pet with
// existing bookings rather than leaving them dangling.
export async function deletePet(petId: string): Promise<void> {
  const { count } = await customerSupabase.from('bookings').select('id', { count: 'exact', head: true }).eq('pet_id', petId);
  if (count && count > 0) {
    throw new Error("This pet has existing bookings and can't be deleted.");
  }

  const { error } = await customerSupabase.from('pets').delete().eq('id', petId);
  if (error) throw error;
}

export async function fetchPetDocuments(petId: string): Promise<PetDocument[]> {
  const { data, error } = await customerSupabase
    .from('pet_documents')
    .select('id, pet_id, label, storage_path, mime_type, document_type, expires_at, created_at')
    .eq('pet_id', petId)
    .order('created_at', { ascending: false });
  if (error) throw error;

  return (data ?? []).map((d) => ({
    id: d.id,
    petId: d.pet_id,
    label: d.label,
    storagePath: d.storage_path,
    mimeType: d.mime_type ?? undefined,
    documentType: d.document_type,
    expiresAt: d.expires_at ?? undefined,
    createdAt: d.created_at,
  }));
}

export async function insertPetDocument(
  petId: string,
  ownerId: string,
  fields: { label: string; storagePath: string; mimeType: string; documentType: PetDocumentType; expiresAt: string | null }
): Promise<void> {
  const { error } = await customerSupabase.from('pet_documents').insert({
    pet_id: petId,
    owner_id: ownerId,
    label: fields.label,
    storage_path: fields.storagePath,
    mime_type: fields.mimeType,
    document_type: fields.documentType,
    expires_at: fields.expiresAt,
  });
  if (error) throw error;
}

export async function deletePetDocument(documentId: string): Promise<void> {
  const { error } = await customerSupabase.from('pet_documents').delete().eq('id', documentId);
  if (error) throw error;
}
