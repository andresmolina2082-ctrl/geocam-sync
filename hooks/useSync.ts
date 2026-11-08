// hooks/useSync.ts
// La sincronización tratada como una consulta de TanStack Query:
// se dispara al iniciar sesión, al recuperar la red y al volver a primer plano, y se reintenta si falla.
import { useQuery } from '@tanstack/react-query';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useAuth } from '@/context/AuthContext';
import { queryClient, useIsOnline } from '@/lib/queryClient';
import { photosRepo } from '@/db/repositories/photos';
import { syncAll } from '@/services/sync';
import { invalidateCloudFeed } from '@/hooks/useCloudFeed';

export { isPending } from '@/services/sync';

/** Pide un ciclo de sincronización. Sin red queda en pausa y se reanuda solo al reconectar. */
export function requestSync() {
  queryClient.invalidateQueries({ queryKey: ['sync'] });
}

export function useSync() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const isOnline = useIsOnline();
  const { data: pending } = useLiveQuery(photosRepo.pendingQuery());

  const sync = useQuery({
    queryKey: ['sync', userId],
    queryFn: async () => {
      const result = await syncAll(userId!);
      // Si el ciclo subió, bajó o borró algo, el feed de la nube quedó viejo
      if (result.pulled + result.pushed + result.deleted > 0) invalidateCloudFeed();
      return result;
    },
    enabled: !!userId,
    staleTime: 0,
    retry: 2,
    refetchOnReconnect: 'always', // volvió la red
    refetchOnWindowFocus: 'always', // la app volvió a primer plano
  });

  return {
    isOnline,
    pendingCount: pending.length,
    isSyncing: sync.fetchStatus === 'fetching',
    lastResult: sync.data,
    error: sync.error,
    syncNow: () => sync.refetch(),
  };
}
