// services/cloudFeed.ts
// Feed de la nube: lee directamente de Supabase las fotos del usuario, por páginas.
// No pasa por SQLite: muestra lo que hay en la nube en este momento (útil para verificar la sincronización).
import { supabase } from '@/lib/supabase';
import { BUCKET } from '@/services/cloudPhotos';

export const FEED_PAGE_SIZE = 12; // 4 filas de 3 miniaturas

export interface CloudPhoto {
  id: number;
  client_id: string;
  storage_path: string;
  latitude: number | null;
  longitude: number | null;
  note: string | null;
  favorite: boolean;
  source: 'camera' | 'gallery';
  taken_at: string;
  updated_at: string;
  /** URL firmada (el bucket es privado). null si no se pudo firmar, por ejemplo, si falta el archivo. */
  imageUrl: string | null;
}

export interface CloudPage {
  items: CloudPhoto[];
  /** id de la última foto de la página; null si no hay más páginas. */
  nextCursor: number | null;
}

export interface CloudFeedParams {
  cursor: number | null;
  search: string;
  onlyFavorites: boolean;
}

/**
 * Una página del feed. Paginación por cursor (keyset) sobre id descendente:
 * "las 12 anteriores a la última que ya tengo". A diferencia de offset, no salta ni repite
 * fotos cuando otro teléfono sube una nueva mientras se baja por la lista.
 */
export async function listCloudPage({
  cursor,
  search,
  onlyFavorites,
}: CloudFeedParams): Promise<CloudPage> {
  let query = supabase
    .from('photos')
    .select(
      'id, client_id, storage_path, latitude, longitude, note, favorite, source, taken_at, updated_at'
    )
    .is('deleted_at', null) // las borradas no se muestran
    .order('id', { ascending: false })
    .limit(FEED_PAGE_SIZE);

  if (cursor !== null) query = query.lt('id', cursor);
  const term = search.trim();
  if (term) query = query.ilike('note', `%${term}%`);
  if (onlyFavorites) query = query.eq('favorite', true);

  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as Omit<CloudPhoto, 'imageUrl'>[];

  // Una sola petición firma todas las miniaturas de la página
  const urls = new Map<string, string>();
  if (rows.length > 0) {
    const { data: signed, error: signError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrls(
        rows.map((r) => r.storage_path),
        3600
      );
    if (signError) throw signError;
    for (const s of signed ?? []) {
      if (s.path && s.signedUrl && !s.error) urls.set(s.path, s.signedUrl);
    }
  }

  return {
    items: rows.map((r) => ({ ...r, imageUrl: urls.get(r.storage_path) ?? null })),
    nextCursor: rows.length === FEED_PAGE_SIZE ? rows[rows.length - 1].id : null,
  };
}
