// services/sync.ts
// Semana 9: sincronización en dos sentidos entre SQLite (fuente de verdad) y Supabase.
// Diseño: 1) bajar lo que cambió en la nube, 2) subir lo pendiente.
// Conflictos de edición: gana el último cambio. Conflicto borrado vs. edición: gana el borrado.
import { supabase } from '@/lib/supabase';
import { photosRepo } from '@/db/repositories/photos';
import { syncMetaRepo } from '@/db/repositories/syncMeta';
import { BUCKET } from '@/services/cloudPhotos';
import { deletePhotoFile, downloadPhotoFile } from '@/services/photoFiles';

export interface RemotePhoto {
  id: number;
  client_id: string;
  storage_path: string;
  latitude: number | null;
  longitude: number | null;
  note: string | null;
  favorite: boolean;
  source: 'camera' | 'gallery';
  taken_at: string;
  updated_at: string; // reloj del teléfono: decide conflictos
  server_updated_at: string; // reloj del servidor: cursor de bajada
  deleted_at: string | null; // borrado lógico (C1)
}

export interface SyncResult {
  pulled: number;
  pushed: number;
  deleted: number; // borrados aplicados (bajados o subidos)
  finishedAt: number;
}

/** Filas por petición al bajar. Si llega una página llena se pide la siguiente. */
export const PULL_PAGE_SIZE = 200;

/** Gana el último cambio. Con fechas iguales no gana nadie: ya están sincronizados. */
export function remoteWins(localUpdatedAt: Date | null, remoteUpdatedAt: string): boolean {
  return new Date(remoteUpdatedAt).getTime() > (localUpdatedAt?.getTime() ?? 0);
}

/** Pendiente: nunca subida, editada después de la última subida, o borrada (lápida). */
export function isPending(photo: {
  syncedAt: Date | null;
  updatedAt: Date | null;
  deletedAt?: Date | null;
}): boolean {
  if (photo.deletedAt) return true;
  if (!photo.syncedAt) return true;
  return (photo.updatedAt?.getTime() ?? 0) > photo.syncedAt.getTime();
}

/** Bajar: solo lo que llegó al servidor después del cursor, página por página. */
async function pull(userId: string): Promise<{ applied: number; deleted: number }> {
  const cursorKey = `lastPulledAt:${userId}`;
  let applied = 0;
  let deleted = 0;

  while (true) {
    const since = (await syncMetaRepo.get(cursorKey)) ?? '1970-01-01T00:00:00Z';
    const { data, error } = await supabase
      .from('photos')
      .select('*')
      .gt('server_updated_at', since)
      .order('server_updated_at', { ascending: true })
      .limit(PULL_PAGE_SIZE);
    if (error) throw error;
    const rows = data as RemotePhoto[];

    for (const remote of rows) {
      const local = await photosRepo.findByClientId(remote.client_id);
      const remoteUpdatedAt = new Date(remote.updated_at);

      if (remote.deleted_at) {
        // Borrada en otro teléfono: el borrado gana aunque aquí haya ediciones pendientes
        if (local) {
          deletePhotoFile(local.uri);
          await photosRepo.purge(local.id);
          deleted++;
        }
        // Si no existe en local no hay nada que hacer: nunca se descarga una foto borrada
      } else if (!local) {
        // Foto creada en otro teléfono: se descarga el archivo y se crea la fila local
        const uri = await downloadPhotoFile(remote.storage_path, remote.client_id);
        await photosRepo.insertFromRemote({
          clientId: remote.client_id,
          uri,
          latitude: remote.latitude,
          longitude: remote.longitude,
          note: remote.note,
          favorite: remote.favorite,
          source: remote.source,
          createdAt: new Date(remote.taken_at),
          updatedAt: remoteUpdatedAt,
          remotePath: remote.storage_path,
          syncedAt: remoteUpdatedAt, // nace sincronizada
        });
        applied++;
      } else if (local.deletedAt) {
        // Aquí se borró y aún no se subió: el borrado gana, push lo enviará enseguida
      } else if (remoteWins(local.updatedAt, remote.updated_at)) {
        // La versión de la nube es más nueva: se aplica en local
        await photosRepo.applyRemote(local.id, {
          note: remote.note,
          favorite: remote.favorite,
          updatedAt: remoteUpdatedAt,
          syncedAt: remoteUpdatedAt,
        });
        applied++;
      }
      // Si la versión local es más nueva no se toca: push la subirá enseguida

      // El cursor avanza fila por fila: si algo falla, el siguiente intento continúa desde aquí
      await syncMetaRepo.set(cursorKey, remote.server_updated_at);
    }

    if (rows.length < PULL_PAGE_SIZE) break; // última página
  }
  return { applied, deleted };
}

/** Subir: todo lo pendiente, de forma que repetirlo no duplique nada (idempotente). */
async function push(userId: string): Promise<{ pushed: number; deleted: number }> {
  const pending = await photosRepo.listPending();
  let deleted = 0;

  for (const photo of pending) {
    if (!photo.clientId) continue; // ensureSyncFields() debió rellenarlo
    const path = photo.remotePath ?? `${userId}/${photo.clientId}.jpg`;
    const updatedAt = photo.updatedAt ?? photo.createdAt;

    if (photo.deletedAt) {
      // ---- Borrado (C1) ----
      if (!photo.remotePath) {
        // Nunca llegó a la nube: basta con eliminarla aquí
        await photosRepo.purge(photo.id);
        deleted++;
        continue;
      }
      // 1. Lápida en la nube (upsert: también sirve si la fila no alcanzó a crearse)
      const { error } = await supabase.from('photos').upsert(
        {
          client_id: photo.clientId,
          storage_path: path,
          source: photo.source,
          taken_at: photo.createdAt.toISOString(),
          updated_at: updatedAt.toISOString(),
          deleted_at: photo.deletedAt.toISOString(),
        },
        { onConflict: 'client_id' }
      );
      if (error) throw error;
      // 2. El archivo ya no hace falta. Si falla no se reintenta: la fila ya dice "borrada"
      await supabase.storage.from(BUCKET).remove([path]);
      // 3. Ahora sí se elimina la fila local
      await photosRepo.purge(photo.id);
      deleted++;
      continue;
    }

    // 1. El archivo solo se sube la primera vez
    if (!photo.remotePath) {
      const arrayBuffer = await fetch(photo.uri).then((res) => res.arrayBuffer());
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, arrayBuffer, { contentType: 'image/jpeg' });
      // "ya existe": un intento anterior subió el archivo pero no alcanzó a guardar la fila
      if (error && !/exists/i.test(error.message)) throw error;
    }

    // 2. upsert por client_id: crea la fila o la actualiza, nunca la duplica
    const { error } = await supabase.from('photos').upsert(
      {
        client_id: photo.clientId,
        storage_path: path,
        latitude: photo.latitude,
        longitude: photo.longitude,
        note: photo.note,
        favorite: photo.favorite,
        source: photo.source,
        taken_at: photo.createdAt.toISOString(),
        updated_at: updatedAt.toISOString(),
      },
      { onConflict: 'client_id' }
    );
    if (error) throw error;

    // 3. syncedAt = la versión que se subió, no "ahora".
    //    Si el usuario editó (o borró) la foto mientras subía, sigue pendiente.
    await photosRepo.markSynced(photo.id, path, updatedAt);
  }
  return { pushed: pending.length - deleted, deleted };
}

async function runSync(userId: string): Promise<SyncResult> {
  let pulled = 0;
  let pushed = 0;
  let deleted = 0;
  // Si hubo cambios durante el ciclo, se repite (máximo 3 vueltas) para no dejarlos esperando
  for (let round = 0; round < 3; round++) {
    const down = await pull(userId); // primero bajar...
    const up = await push(userId); // ...después subir
    pulled += down.applied;
    deleted += down.deleted + up.deleted;
    pushed += up.pushed;
    if (up.pushed + up.deleted === 0) break;
    if ((await photosRepo.listPending()).length === 0) break;
  }
  return { pulled, pushed, deleted, finishedAt: Date.now() };
}

// Un solo ciclo a la vez: si llega otra petición mientras hay uno en curso, se reutiliza
let running: Promise<SyncResult> | null = null;

/** Un ciclo completo de sincronización. Seguro de llamar varias veces seguidas. */
export function syncAll(userId: string): Promise<SyncResult> {
  if (!running) {
    running = runSync(userId).finally(() => {
      running = null;
    });
  }
  return running;
}
