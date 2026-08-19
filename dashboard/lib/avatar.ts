import { supabase } from '@/lib/supabase';

// Mirrors services/storage.ts's uploadPetPhoto (Expo app) - same
// upload-then-persist-the-path shape, adapted for a browser File input
// instead of a native image-picker URI, and a public bucket (see
// supabase/migrations/0056_groomer_avatar_storage.sql) so no signed-URL
// refresh is needed.
export async function uploadGroomerAvatar(userId: string, groomerId: string, file: File): Promise<string> {
  const extension = file.name.split('.').pop() ?? 'jpg';
  const path = `${userId}/avatar.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from('groomer-avatars')
    .upload(path, file, { contentType: file.type, upsert: true });
  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from('groomer-avatars').getPublicUrl(path);
  // Cache-bust: upsert overwrites the same path, so without this the browser
  // (or a CDN) can keep serving the previous photo after a re-upload.
  const avatarUrl = `${data.publicUrl}?v=${Date.now()}`;

  const { error: updateError } = await supabase.from('groomers').update({ avatar_url: avatarUrl }).eq('id', groomerId);
  if (updateError) throw updateError;

  return avatarUrl;
}
