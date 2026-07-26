import { supabase } from '@/services/supabase';

async function uriToBlob(uri: string) {
  const response = await fetch(uri);
  return response.blob();
}

export async function uploadPetPhoto(ownerId: string, petId: string, uri: string, contentType: string) {
  const blob = await uriToBlob(uri);
  const extension = contentType.split('/')[1] ?? 'jpg';
  const path = `${ownerId}/${petId}.${extension}`;

  const { error } = await supabase.storage
    .from('pet-photos')
    .upload(path, blob, { contentType, upsert: true });

  if (error) throw error;
  return path;
}

export async function uploadPetDocument(
  ownerId: string,
  petId: string,
  uri: string,
  contentType: string,
  fileName: string
) {
  const blob = await uriToBlob(uri);
  const path = `${ownerId}/${petId}/${Date.now()}-${fileName}`;

  const { error } = await supabase.storage
    .from('pet-documents')
    .upload(path, blob, { contentType });

  if (error) throw error;
  return path;
}

export async function getSignedUrl(bucket: 'pet-photos' | 'pet-documents', path: string) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}

export async function deleteStorageFile(bucket: 'pet-photos' | 'pet-documents', path: string) {
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) throw error;
}
