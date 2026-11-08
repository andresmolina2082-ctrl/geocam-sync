// hooks/useCloudFeed.ts
// Feed de la nube con TanStack Query: caché, paginación infinita, reintentos,
// pausa sin conexión y recarga al volver a primer plano.
import { useMemo } from 'react';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { queryClient, useIsOnline } from '@/lib/queryClient';
import { getFeedView } from '@/lib/feedView';
import { listCloudPage } from '@/services/cloudFeed';
import { photosRepo } from '@/db/repositories/photos';

export const cloudFeedKey = (userId: string | undefined) => ['cloudFeed', userId] as const;

/** id local de una foto de la nube, o null si aún no está en este teléfono (o se borró aquí). */
export async function findLocalPhotoId(clientId: string): Promise<number | null> {
  const local = await photosRepo.findByClientId(clientId);
  return local && !local.deletedAt ? local.id : null;
}

/** La sincronización cambió la nube: el feed queda desactualizado y se recarga si está visible. */
export function invalidateCloudFeed() {
  queryClient.invalidateQueries({ queryKey: ['cloudFeed'] });
}

export function useCloudFeed(filters: { search: string; onlyFavorites: boolean }) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const isOnline = useIsOnline();

  const query = useInfiniteQuery({
    // Cada combinación de filtros tiene su propia caché (volver al filtro anterior es instantáneo)
    queryKey: [...cloudFeedKey(userId), filters],
    queryFn: ({ pageParam }) => listCloudPage({ cursor: pageParam, ...filters }),
    initialPageParam: null as number | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: !!userId,
    placeholderData: keepPreviousData, // al cambiar el filtro no parpadea la lista anterior
    staleTime: 60_000,
    gcTime: 30 * 60_000, // las URL firmadas duran 1 h: la caché se descarta antes
  });

  // Las páginas se aplanan en una sola lista para FlatList
  const photos = useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data]);

  const view = getFeedView({
    status: query.status,
    fetchStatus: query.fetchStatus,
    isOnline,
    itemCount: photos.length,
    hasFilters: filters.search.trim() !== '' || filters.onlyFavorites,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    isFetchNextPageError: query.isFetchNextPageError,
    isRefetchError: query.isRefetchError,
  });

  /** Para onEndReached: nunca pide dos veces la misma página ni insiste tras un error. */
  const loadMore = () => {
    if (query.hasNextPage && !query.isFetchingNextPage && !query.isFetchNextPageError && isOnline) {
      query.fetchNextPage();
    }
  };

  return {
    photos,
    view,
    isOnline,
    error: query.error,
    isRefreshing: query.isRefetching && !query.isFetchingNextPage,
    refresh: () => query.refetch(),
    loadMore,
    retryNextPage: () => query.fetchNextPage(),
  };
}
