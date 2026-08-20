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

export async function uploadGroomerAvatar(userId: string, groomerId: string, uri: string, contentType: string) {
  const blob = await uriToBlob(uri);
  const extension = contentType.split('/')[1] ?? 'jpg';
  const path = `${userId}/avatar.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from('groomer-avatars')
    .upload(path, blob, { contentType, upsert: true });
  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from('groomer-avatars').getPublicUrl(path);
  // Cache-bust: upsert overwrites the same path, so without this the app
  // (or a CDN) can keep serving the previous photo after a re-upload.
  const avatarUrl = `${data.publicUrl}?v=${Date.now()}`;

  const { error: updateError } = await supabase.from('groomers').update({ avatar_url: avatarUrl }).eq('id', groomerId);
  if (updateError) throw updateError;

  return avatarUrl;
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
