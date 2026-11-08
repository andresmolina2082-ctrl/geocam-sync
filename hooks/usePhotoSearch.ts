// hooks/usePhotoSearch.ts
// C4: el segundo argumento de useLiveQuery son las dependencias.
// Cuando cambia la búsqueda o un filtro, la consulta se vuelve a construir y ejecutar.
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { photosRepo, type PhotoFilters } from '@/db/repositories/photos';

export type { AlbumFilter, PhotoFilters } from '@/db/repositories/photos';

export function usePhotoSearch(filters: PhotoFilters) {
  const { search, albumId, onlyFavorites } = filters;
  const { data, error } = useLiveQuery(photosRepo.searchQuery(filters), [
    search,
    albumId,
    onlyFavorites,
  ]);
  return { results: data, error };
}
