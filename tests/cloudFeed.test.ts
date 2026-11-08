// tests/cloudFeed.test.ts
// Paginación por cursor del feed de la nube (services/cloudFeed.ts).
import { beforeEach, describe, expect, it } from 'vitest';
import { FEED_PAGE_SIZE, listCloudPage, type CloudPage } from '@/services/cloudFeed';
import { resetServer } from './harness/server';
import type { FakeSupabase } from './harness/fakeSupabase';

let server: FakeSupabase;
const noFilters = { search: '', onlyFavorites: false };

/** Recorre el feed completo como lo hace useInfiniteQuery: página tras página con nextCursor. */
async function readAll(filters = noFilters) {
  const pages: CloudPage[] = [];
  let cursor: number | null = null;
  do {
    const page = await listCloudPage({ cursor, ...filters });
    pages.push(page);
    cursor = page.nextCursor;
  } while (cursor !== null);
  return pages;
}

beforeEach(() => {
  server = resetServer();
});

describe('feed paginado de la nube', () => {
  it('trae páginas de tamaño fijo, de la más nueva a la más antigua, y termina', async () => {
    for (let i = 1; i <= 30; i++) server.seed({ client_id: `c${i}`, note: `foto ${i}` });

    const pages = await readAll();
    expect(pages.map((p) => p.items.length)).toEqual([FEED_PAGE_SIZE, FEED_PAGE_SIZE, 6]);
    expect(pages.at(-1)!.nextCursor).toBeNull();

    const ids = pages.flatMap((p) => p.items.map((i) => i.id));
    expect(ids).toEqual([...ids].sort((a, b) => b - a)); // descendente
    expect(new Set(ids).size).toBe(30); // sin repetidas
  });

  it('no muestra fotos borradas (borrado lógico)', async () => {
    for (let i = 1; i <= 15; i++) {
      server.seed({ client_id: `c${i}`, deleted_at: i % 5 === 0 ? '2026-02-01T00:00:00Z' : null });
    }
    const items = (await readAll()).flatMap((p) => p.items);
    expect(items).toHaveLength(12);
    expect(items.some((i) => ['c5', 'c10', 'c15'].includes(i.client_id))).toBe(false);
  });

  it('una foto subida mientras se navega no duplica ni salta elementos (cursor, no offset)', async () => {
    for (let i = 1; i <= 24; i++) server.seed({ client_id: `c${i}` });

    const first = await listCloudPage({ cursor: null, ...noFilters });
    server.seed({ client_id: 'nueva' }); // otro teléfono sube una foto
    const second = await listCloudPage({ cursor: first.nextCursor, ...noFilters });

    const ids = [...first.items, ...second.items].map((i) => i.client_id);
    expect(new Set(ids).size).toBe(24);
    expect(ids).not.toContain('nueva'); // aparecerá al refrescar, arriba
    expect(ids.at(-1)).toBe('c1');
  });

  it('filtra por nota (sin distinguir mayúsculas) y por favoritas', async () => {
    server.seed({ client_id: 'a', note: 'Playa de Riohacha', favorite: true });
    server.seed({ client_id: 'b', note: 'playa del Cabo' });
    server.seed({ client_id: 'c', note: 'Desierto', favorite: true });
    server.seed({ client_id: 'd', note: null });

    const playa = (await readAll({ search: 'PLAYA', onlyFavorites: false })).flatMap((p) => p.items);
    expect(playa.map((i) => i.client_id).sort()).toEqual(['a', 'b']);

    const favs = (await readAll({ search: '', onlyFavorites: true })).flatMap((p) => p.items);
    expect(favs.map((i) => i.client_id).sort()).toEqual(['a', 'c']);

    const both = (await readAll({ search: 'playa', onlyFavorites: true })).flatMap((p) => p.items);
    expect(both.map((i) => i.client_id)).toEqual(['a']);
  });

  it('firma las miniaturas en una sola petición por página y tolera un archivo faltante', async () => {
    for (let i = 1; i <= 5; i++) server.seed({ client_id: `c${i}` });
    server.files.delete('user-1/c3.jpg');

    const page = await listCloudPage({ cursor: null, ...noFilters });
    expect(server.requests.sign).toBe(1);
    expect(page.items.find((i) => i.client_id === 'c3')!.imageUrl).toBeNull();
    expect(page.items.filter((i) => i.imageUrl !== null)).toHaveLength(4);
  });

  it('solo muestra las fotos del usuario (RLS)', async () => {
    server.seed({ client_id: 'mia' });
    server.seed({ client_id: 'ajena', user_id: 'user-2' });
    const items = (await readAll()).flatMap((p) => p.items);
    expect(items.map((i) => i.client_id)).toEqual(['mia']);
  });

  it('propaga el error de red para que TanStack Query reintente y muestre el estado de error', async () => {
    server.seed({ client_id: 'c1' });
    server.failures.push('select');
    await expect(listCloudPage({ cursor: null, ...noFilters })).rejects.toThrow('network error');
  });

  it('nube vacía: una página sin elementos y sin cursor', async () => {
    const page = await listCloudPage({ cursor: null, ...noFilters });
    expect(page).toEqual({ items: [], nextCursor: null });
    expect(server.requests.sign).toBe(0);
  });
});
