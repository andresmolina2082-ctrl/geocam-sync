// hooks/useAlbums.ts
import { useCallback } from 'react';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { albumsRepo } from '@/db/repositories/albums';

export function useAlbums() {
  const { data: albums } = useLiveQuery(albumsRepo.listQuery());

  /** Devuelve un mensaje de error para la UI, o null si se creó. */
  const createAlbum = useCallback(async (name: string): Promise<string | null> => {
    const clean = name.trim();
    if (!clean) return 'Escribe un nombre.';
    try {
      await albumsRepo.create(clean);
      return null;
    } catch (e) {
      const message = e instanceof Error ? e.message : '';
      return message.includes('UNIQUE') ? 'Ya existe un álbum con ese nombre.' : 'No se pudo crear el álbum.';
    }
  }, []);

  const removeAlbum = useCallback((id: number) => albumsRepo.remove(id), []);

  return { albums, createAlbum, removeAlbum };
}
