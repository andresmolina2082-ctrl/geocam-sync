// tests/setup.ts
// Reemplaza solo lo que necesita un teléfono o internet. La lógica que se prueba es la real:
// db/repositories/*, services/sync.ts, services/cloudFeed.ts y lib/feedView.ts.
import { randomUUID } from 'node:crypto';
import { vi } from 'vitest';
import { activePhone, dbProxy } from './harness/phones';
import { server } from './harness/server';

vi.mock('expo-crypto', () => ({ randomUUID: () => randomUUID() }));

vi.mock('@/db/client', () => ({ db: dbProxy, expoDb: null }));

vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return server.current;
  },
}));

// Archivos del teléfono: se registran en el Set del teléfono activo
vi.mock('@/services/photoFiles', () => ({
  isPersisted: () => true,
  persistPhoto: async (uri: string) => uri,
  deletePhotoFile: (uri: string) => {
    activePhone().files.delete(uri);
  },
  deleteAllPhotoFiles: () => {
    activePhone().files.clear();
  },
  downloadPhotoFile: async (storagePath: string, clientId: string) => {
    if (!server.current.files.has(storagePath)) throw new Error(`Object not found: ${storagePath}`);
    const uri = `file:///${activePhone().name}/photos/${clientId}.jpg`;
    activePhone().files.add(uri);
    return uri;
  },
}));

// push lee el archivo con fetch(uri): solo funciona si el archivo existe en el teléfono activo
vi.stubGlobal('fetch', async (uri: string) => {
  if (!activePhone().files.has(uri)) throw new Error(`No existe el archivo ${uri}`);
  return { arrayBuffer: async () => new ArrayBuffer(8) };
});
