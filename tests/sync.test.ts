// tests/sync.test.ts
// Escenarios de sincronización en dos sentidos con dos (o tres) teléfonos y un servidor.
// Se ejecuta el código real de services/sync.ts y db/repositories/*.ts sobre SQLite real.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { photosRepo } from '@/db/repositories/photos';
import { PULL_PAGE_SIZE, syncAll } from '@/services/sync';
import { deletePhotoFile } from '@/services/photoFiles';
import { createPhone, onPhone, type Phone } from './harness/phones';
import { resetServer } from './harness/server';
import type { FakeSupabase } from './harness/fakeSupabase';

const USER = 'user-1';
let server: FakeSupabase;
let A: Phone;
let B: Phone;
let clock: number;
let counter = 0;

/** Avanza el reloj de los teléfonos (para que "después" sea de verdad después). */
function tick(ms = 60_000) {
  clock += ms;
  vi.setSystemTime(clock);
}

// ---- Acciones del usuario, iguales a las de hooks/usePhotos.ts ----

async function takePhoto(phone: Phone, note: string | null = null) {
  tick(1000); // cada foto se toma en un instante distinto
  return onPhone(phone, async () => {
    const uri = `file:///${phone.name}/photos/${++counter}.jpg`;
    phone.files.add(uri);
    await photosRepo.create({ uri, source: 'camera', latitude: 11.54, longitude: -72.9, accuracy: 5, note });
    const [photo] = await photosRepo.listQuery();
    return photo;
  });
}

const editNote = (phone: Phone, clientId: string, note: string) =>
  onPhone(phone, async () => {
    const p = await photosRepo.findByClientId(clientId);
    await photosRepo.update(p!.id, { note });
  });

const deletePhoto = (phone: Phone, clientId: string) =>
  onPhone(phone, async () => {
    const p = await photosRepo.findByClientId(clientId);
    const uri = await photosRepo.softDelete(p!.id);
    if (uri) deletePhotoFile(uri);
  });

const clearAll = (phone: Phone) =>
  onPhone(phone, async () => {
    const uris = await photosRepo.softDeleteAll();
    uris.forEach(deletePhotoFile);
  });

const sync = (phone: Phone) => onPhone(phone, () => syncAll(USER));
/** Lo que el usuario ve en pantalla (sin lápidas). */
const visible = (phone: Phone) => onPhone(phone, () => photosRepo.listQuery());
const pending = (phone: Phone) => onPhone(phone, () => photosRepo.listPending());
/** Todas las filas, incluidas las lápidas. */
const rawRows = (phone: Phone) => phone.sqlite.prepare('select * from photos').all() as any[];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  clock = Date.parse('2026-03-01T12:00:00Z');
  vi.setSystemTime(clock);
  server = resetServer();
  A = createPhone('A');
  B = createPhone('B');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('subir y bajar', () => {
  it('sube una foto pendiente y aparece en el otro teléfono con su archivo', async () => {
    const photo = await takePhoto(A, 'Playa');
    expect(await pending(A)).toHaveLength(1);

    const resultA = await sync(A);
    expect(resultA.pushed).toBe(1);
    expect(await pending(A)).toHaveLength(0);
    expect(server.visible()).toHaveLength(1);
    expect(server.files.has(`${USER}/${photo.clientId}.jpg`)).toBe(true);

    const resultB = await sync(B);
    expect(resultB.pulled).toBe(1);
    const [onB] = await visible(B);
    expect(onB.clientId).toBe(photo.clientId);
    expect(onB.note).toBe('Playa');
    expect(onB.latitude).toBe(11.54);
    expect(B.files.has(onB.uri)).toBe(true);
    expect(await pending(B)).toHaveLength(0); // nace sincronizada
  });

  it('repetir la sincronización no duplica filas ni archivos', async () => {
    await takePhoto(A);
    await takePhoto(A);
    for (let i = 0; i < 4; i++) await sync(A);
    await sync(B);
    await sync(B);

    expect(server.visible()).toHaveLength(2);
    expect(server.files.size).toBe(2);
    expect(await visible(B)).toHaveLength(2);
    expect(server.requests.upload).toBe(2); // cada archivo se subió una sola vez
  });

  it('llamadas simultáneas comparten un solo ciclo', async () => {
    await takePhoto(A);
    const [r1, r2, r3] = await onPhone(A, () =>
      Promise.all([syncAll(USER), syncAll(USER), syncAll(USER)])
    );
    expect(r1).toBe(r2);
    expect(r2).toBe(r3);
    expect(server.requests.upsert).toBe(1);
  });

  it('baja más de una página de cambios en un solo ciclo', async () => {
    const total = PULL_PAGE_SIZE * 2 + 50;
    for (let i = 0; i < total; i++) server.seed({ client_id: crypto.randomUUID(), note: `n${i}` });

    const result = await sync(B);
    expect(result.pulled).toBe(total);
    expect(await visible(B)).toHaveLength(total);
  });
});

describe('conflictos de edición: gana el último cambio', () => {
  it.each(['A primero', 'B primero'])('converge a la nota más reciente (%s)', async (order) => {
    const photo = await takePhoto(A, 'original');
    await sync(A);
    await sync(B);

    // Ambos sin red: A edita, un minuto después B edita
    await editNote(A, photo.clientId!, 'nota de A');
    tick();
    await editNote(B, photo.clientId!, 'nota de B');

    const phones = order === 'A primero' ? [A, B, A] : [B, A, B];
    for (const p of phones) await sync(p);

    expect((await visible(A))[0].note).toBe('nota de B');
    expect((await visible(B))[0].note).toBe('nota de B');
    expect(server.byClientId(photo.clientId!)!.note).toBe('nota de B');
  });

  it('una edición hecha durante la subida no se pierde', async () => {
    const photo = await takePhoto(A, 'v1');
    let edited = false;
    server.beforeUpsert = async () => {
      if (edited) return;
      edited = true;
      tick(1000);
      await editNote(A, photo.clientId!, 'v2'); // el usuario edita mientras sube
    };

    await sync(A);
    expect(server.byClientId(photo.clientId!)!.note).toBe('v2');
    expect(await pending(A)).toHaveLength(0);
  });

  it('si la subida falla a mitad, el reintento termina sin duplicar', async () => {
    await takePhoto(A);
    server.failures.push('upsert'); // el archivo sube, la fila no
    await expect(sync(A)).rejects.toThrow('network error');
    expect(await pending(A)).toHaveLength(1);

    await sync(A);
    expect(server.visible()).toHaveLength(1);
    expect(server.files.size).toBe(1);
    expect(await pending(A)).toHaveLength(0);
  });
});

describe('borrados sincronizados (C1)', () => {
  it('borrar en A lo marca en la nube, borra el archivo y desaparece en B', async () => {
    const photo = await takePhoto(A);
    await sync(A);
    await sync(B);
    expect(await visible(B)).toHaveLength(1);
    const uriOnB = (await visible(B))[0].uri;

    tick();
    await deletePhoto(A, photo.clientId!);
    // Antes de sincronizar: no se ve, pero queda una lápida pendiente
    expect(await visible(A)).toHaveLength(0);
    expect(rawRows(A)).toHaveLength(1);
    expect(await pending(A)).toHaveLength(1);

    const resultA = await sync(A);
    expect(resultA.deleted).toBe(1);
    const remote = server.byClientId(photo.clientId!)!;
    expect(remote.deleted_at).not.toBeNull(); // borrado lógico: la fila sigue para avisar a los demás
    expect(server.files.size).toBe(0); // el archivo sí se borra
    expect(rawRows(A)).toHaveLength(0); // ya llegó a la nube: la lápida se elimina

    const resultB = await sync(B);
    expect(resultB.deleted).toBe(1);
    expect(await visible(B)).toHaveLength(0);
    expect(rawRows(B)).toHaveLength(0);
    expect(B.files.has(uriOnB)).toBe(false);
  });

  it('una foto que nunca subió se borra sin tocar la nube', async () => {
    const photo = await takePhoto(A);
    await deletePhoto(A, photo.clientId!);
    await sync(A);

    expect(rawRows(A)).toHaveLength(0);
    expect(server.rows).toHaveLength(0);
    expect(server.requests.upsert).toBe(0);
    expect(server.requests.upload).toBe(0);
  });

  it('un teléfono nuevo no descarga fotos borradas (no resucitan)', async () => {
    const keep = await takePhoto(A, 'queda');
    const gone = await takePhoto(A, 'se va');
    await sync(A);
    await deletePhoto(A, gone.clientId!);
    await sync(A);

    const C = createPhone('C');
    await sync(C);
    const onC = await visible(C);
    expect(onC.map((p) => p.clientId)).toEqual([keep.clientId]);
    expect(rawRows(C)).toHaveLength(1);
  });

  it.each(['A primero', 'B primero'])(
    'el borrado gana a una edición posterior hecha sin red en otro teléfono (%s)',
    async (order) => {
      const photo = await takePhoto(A, 'original');
      await sync(A);
      await sync(B);

      await deletePhoto(A, photo.clientId!);
      tick();
      await editNote(B, photo.clientId!, 'editada después'); // B aún no sabe del borrado

      const phones = order === 'A primero' ? [A, B, A] : [B, A, B];
      for (const p of phones) await sync(p);

      expect(await visible(A)).toHaveLength(0);
      expect(await visible(B)).toHaveLength(0);
      expect(rawRows(B)).toHaveLength(0);
      expect(server.byClientId(photo.clientId!)!.deleted_at).not.toBeNull();
    }
  );

  it('borrar mientras la foto se está subiendo termina borrada en todas partes', async () => {
    const photo = await takePhoto(A);
    let deleted = false;
    server.beforeUpsert = async () => {
      if (deleted) return;
      deleted = true;
      tick(1000);
      await deletePhoto(A, photo.clientId!); // el usuario borra durante la subida
    };

    await sync(A);
    expect(rawRows(A)).toHaveLength(0);
    expect(server.byClientId(photo.clientId!)!.deleted_at).not.toBeNull();
    expect(server.files.size).toBe(0);

    await sync(B);
    expect(rawRows(B)).toHaveLength(0);
  });

  it('agitar para borrar todo se propaga al otro teléfono', async () => {
    await takePhoto(A);
    await takePhoto(A);
    await takePhoto(A);
    await sync(A);
    await sync(B);
    expect(await visible(B)).toHaveLength(3);

    tick();
    await clearAll(A);
    await sync(A);
    await sync(B);

    expect(server.visible().every((r) => r.deleted_at !== null)).toBe(true);
    expect(server.files.size).toBe(0);
    expect(rawRows(A)).toHaveLength(0);
    expect(rawRows(B)).toHaveLength(0);
  });

  it('si falla la subida del borrado, la lápida se conserva y se reintenta', async () => {
    const photo = await takePhoto(A);
    await sync(A);
    await deletePhoto(A, photo.clientId!);

    server.failures.push('upsert');
    await expect(sync(A)).rejects.toThrow('network error');
    expect(rawRows(A)).toHaveLength(1); // la lápida sigue ahí
    expect(await visible(A)).toHaveLength(0); // pero no se muestra

    await sync(A);
    expect(rawRows(A)).toHaveLength(0);
    expect(server.byClientId(photo.clientId!)!.deleted_at).not.toBeNull();
  });
});
