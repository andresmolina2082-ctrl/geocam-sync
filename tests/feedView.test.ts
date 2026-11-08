// tests/feedView.test.ts
// Cada estado de UI de la pantalla Nube, a partir del estado de TanStack Query.
import { describe, expect, it } from 'vitest';
import { getFeedView, type FeedQueryState } from '@/lib/feedView';

const base: FeedQueryState = {
  status: 'success',
  fetchStatus: 'idle',
  isOnline: true,
  itemCount: 12,
  hasFilters: false,
  hasNextPage: true,
  isFetchingNextPage: false,
  isFetchNextPageError: false,
  isRefetchError: false,
};
const view = (s: Partial<FeedQueryState>) => getFeedView({ ...base, ...s });

describe('estados de UI del feed', () => {
  it('primera carga: indicador de carga', () => {
    expect(view({ status: 'pending', fetchStatus: 'fetching', itemCount: 0 }).body).toBe('loading');
  });

  it('sin red y sin datos: la consulta queda en pausa y se avisa', () => {
    const v = view({ status: 'pending', fetchStatus: 'paused', isOnline: false, itemCount: 0 });
    expect(v).toEqual({ body: 'offline-empty', footer: null, banner: null });
  });

  it('falla la primera carga: pantalla de error con reintentar', () => {
    expect(view({ status: 'error', itemCount: 0 }).body).toBe('error');
  });

  it('nube vacía y búsqueda sin resultados son mensajes distintos', () => {
    expect(view({ itemCount: 0, hasNextPage: false }).body).toBe('empty');
    expect(view({ itemCount: 0, hasNextPage: false, hasFilters: true }).body).toBe('empty-search');
  });

  it('lista con más páginas: sin pie (onEndReached pide la siguiente)', () => {
    expect(view({})).toEqual({ body: 'list', footer: null, banner: null });
  });

  it('cargando la página siguiente: indicador al pie', () => {
    expect(view({ isFetchingNextPage: true, fetchStatus: 'fetching' }).footer).toBe('loading-more');
  });

  it('falla la página siguiente: la lista sigue visible y el pie ofrece reintentar', () => {
    const v = view({ status: 'error', isFetchNextPageError: true });
    expect(v.body).toBe('list');
    expect(v.footer).toBe('load-more-error');
  });

  it('última página: "no hay más"', () => {
    expect(view({ hasNextPage: false }).footer).toBe('end');
  });

  it('sin red con datos en caché: lista visible, aviso arriba y pie en pausa', () => {
    expect(view({ isOnline: false, fetchStatus: 'paused' })).toEqual({
      body: 'list',
      footer: 'paused',
      banner: 'offline',
    });
  });

  it('falla la recarga en segundo plano: no se tapa la lista, se avisa', () => {
    const v = view({ status: 'error', isRefetchError: true });
    expect(v).toEqual({ body: 'list', footer: null, banner: 'refresh-error' });
  });
});
