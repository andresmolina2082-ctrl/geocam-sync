// lib/feedView.ts
// Decide QUÉ mostrar en el feed a partir del estado de TanStack Query.
// Es una función pura (sin React): así cada estado de UI se puede probar en tests/feedView.test.ts.
//
// Detalle de TanStack Query v5 que esto resuelve: si una recarga en segundo plano o la página
// siguiente fallan, status pasa a 'error' AUNQUE ya haya datos. No hay que tapar la lista con
// un error a pantalla completa: se muestra la lista y el error va en un aviso o en el pie.

export type FeedBody =
  | 'loading' // primera carga, sin datos
  | 'offline-empty' // sin red y nunca se cargó nada (la consulta está en pausa)
  | 'error' // falló la primera carga: pantalla de error con "Reintentar"
  | 'empty' // la nube no tiene fotos
  | 'empty-search' // hay fotos, pero ninguna coincide con la búsqueda o el filtro
  | 'list';

export type FeedFooter =
  | 'loading-more' // trayendo la página siguiente
  | 'load-more-error' // falló la página siguiente: botón "Reintentar"
  | 'paused' // hay más páginas, pero no hay red
  | 'end' // ya no hay más páginas
  | null;

export type FeedBanner =
  | 'offline' // sin conexión: se muestran los datos en caché
  | 'refresh-error' // falló la recarga: se muestran los datos anteriores
  | null;

export interface FeedQueryState {
  status: 'pending' | 'error' | 'success';
  fetchStatus: 'fetching' | 'paused' | 'idle';
  isOnline: boolean;
  itemCount: number;
  hasFilters: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isFetchNextPageError: boolean;
  isRefetchError: boolean;
}

export interface FeedView {
  body: FeedBody;
  footer: FeedFooter;
  banner: FeedBanner;
}

export function getFeedView(s: FeedQueryState): FeedView {
  const banner: FeedBanner = !s.isOnline ? 'offline' : s.isRefetchError ? 'refresh-error' : null;

  // Sin datos todavía
  if (s.status === 'pending') {
    const body: FeedBody = s.fetchStatus === 'paused' || !s.isOnline ? 'offline-empty' : 'loading';
    return { body, footer: null, banner: body === 'offline-empty' ? null : banner };
  }

  if (s.itemCount === 0) {
    if (s.status === 'error') return { body: 'error', footer: null, banner: null };
    return { body: s.hasFilters ? 'empty-search' : 'empty', footer: null, banner };
  }

  // Hay datos: la lista siempre se muestra
  let footer: FeedFooter;
  if (s.isFetchingNextPage) footer = 'loading-more';
  else if (s.isFetchNextPageError) footer = 'load-more-error';
  else if (s.hasNextPage) footer = s.isOnline ? null : 'paused'; // null: onEndReached pedirá la siguiente
  else footer = 'end';

  return { body: 'list', footer, banner };
}
