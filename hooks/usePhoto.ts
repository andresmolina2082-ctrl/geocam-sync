// hooks/usePhoto.ts
// Una sola foto, reactiva: si se edita o se borra, la pantalla de detalle se entera sola.
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { photosRepo } from '@/db/repositories/photos';

export function usePhoto(id: number) {
  const { data, error, updatedAt } = useLiveQuery(photosRepo.byIdQuery(id), [id]);
  return {
    photo: data[0] ?? null,
    // updatedAt es undefined hasta que llega el primer resultado
    isLoading: updatedAt === undefined,
    error,
  };
}
