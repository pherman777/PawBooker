import { customerSupabase } from '@/lib/customerSupabase';

// Port of services/storage.ts's customer-facing functions (uploadGroomerAvatar
// is groomer-only, out of scope here). Native's uriToBlob wrapper is dropped -
// a browser File input already hands over a Blob, no fetch(uri) needed.

export async function uploadPetPhoto(ownerId: string, petId: string, file: Blob, contentType: string) {
  const extension = contentType.split('/')[1] ?? 'jpg';
  const path = `${ownerId}/${petId}.${extension}`;

  const { error } = await customerSupabase.storage.from('pet-photos').upload(path, file, { contentType, upsert: true });

  if (error) throw error;
  return path;
}

export async function uploadPetDocument(ownerId: string, petId: string, file: Blob, contentType: string, fileName: string) {
  const path = `${ownerId}/${petId}/${Date.now()}-${fileName}`;

  const { error } = await customerSupabase.storage.from('pet-documents').upload(path, file, { contentType });

  if (error) throw error;
  return path;
}

export async function getSignedUrl(bucket: 'pet-photos' | 'pet-documents', path: string) {
  const { data, error } = await customerSupabase.storage.from(bucket).createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}

export async function deleteStorageFile(bucket: 'pet-photos' | 'pet-documents', path: string) {
  const { error } = await customerSupabase.storage.from(bucket).remove([path]);
  if (error) throw error;
}
