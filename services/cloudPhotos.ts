// services/cloudPhotos.ts
// Acceso a los archivos del bucket privado. La subida ahora vive en services/sync.ts.
import { supabase } from '@/lib/supabase';

export const BUCKET = 'geocam';

/** URL temporal para ver o descargar un archivo de un bucket privado. */
export async function signedUrl(path: string) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}
