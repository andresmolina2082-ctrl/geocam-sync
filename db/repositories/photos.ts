// db/repositories/photos.ts
// Única capa que conoce Drizzle para la tabla photos.
//
// Borrado lógico (C1): borrar una foto NO elimina la fila; le pone deletedAt ("lápida").
// - Todas las consultas de pantalla filtran las lápidas (alive).
// - La lápida queda pendiente y push la sube a la nube. Recién entonces se elimina la fila (purge).
import { and, asc, desc, eq, gt, isNotNull, isNull, like, or, type SQL } from 'drizzle-orm';
import * as Crypto from 'expo-crypto';
import { db } from '@/db/client';
import { photos, type NewPhoto } from '@/db/schema';

type PhotoInput = Omit<NewPhoto, 'id' | 'createdAt' | 'clientId'>;
export type PhotoChanges = Partial<Pick<NewPhoto, 'note' | 'favorite' | 'albumId'>>;

/** Filtro de álbum: null = todos, 'none' = sin álbum, número = ese álbum. */
export type AlbumFilter = number | 'none' | null;

export interface PhotoFilters {
  search: string;
  albumId: AlbumFilter;
  onlyFavorites: boolean;
}

/** Solo fotos no borradas. Las pantallas nunca ven una lápida. */
const alive = isNull(photos.deletedAt);

export const photosRepo = {
  listQuery() {
    return db.select().from(photos).where(alive).orderBy(desc(photos.createdAt));
  },

  withLocationQuery() {
    return db
      .select()
      .from(photos)
      .where(and(alive, isNotNull(photos.latitude), isNotNull(photos.longitude)))
      .orderBy(desc(photos.createdAt));
  },

  withoutLocationQuery() {
    return db
      .select()
      .from(photos)
      .where(and(alive, isNull(photos.latitude)))
      .orderBy(desc(photos.createdAt));
  },

  /** C4: búsqueda por nota (LIKE) + filtros por álbum y favoritas. */
  searchQuery({ search, albumId, onlyFavorites }: PhotoFilters) {
    const conditions: SQL[] = [alive];
    const term = search.trim();
    if (term) conditions.push(like(photos.note, `%${term}%`));
    if (albumId === 'none') conditions.push(isNull(photos.albumId));
    else if (albumId !== null) conditions.push(eq(photos.albumId, albumId));
    if (onlyFavorites) conditions.push(eq(photos.favorite, true));

    return db
      .select()
      .from(photos)
      .where(and(...conditions))
      .orderBy(desc(photos.createdAt));
  },

  /** Una sola foto, reactiva (pantalla de detalle). Una lápida cuenta como "ya no existe". */
  byIdQuery(id: number) {
    return db
      .select()
      .from(photos)
      .where(and(eq(photos.id, id), alive))
      .limit(1);
  },

  async findById(id: number) {
    return await db.select().from(photos).where(eq(photos.id, id)).get();
  },

  async create(data: PhotoInput) {
    await db
      .insert(photos)
      .values({ ...data, clientId: Crypto.randomUUID(), updatedAt: new Date() });
  },

  /** Edición hecha por el usuario: siempre actualiza updatedAt (la foto queda pendiente de subir). */
  async update(id: number, changes: PhotoChanges) {
    await db
      .update(photos)
      .set({ ...changes, updatedAt: new Date() })
      .where(and(eq(photos.id, id), alive));
  },

  // ---------- Borrados (C1) ----------

  /**
   * Borra una foto: queda como lápida pendiente de subir.
   * Devuelve la uri del archivo para que el llamador lo borre del teléfono.
   */
  async softDelete(id: number): Promise<string | null> {
    const photo = await photosRepo.findById(id);
    if (!photo || photo.deletedAt) return null;
    const now = new Date();
    await db.update(photos).set({ deletedAt: now, updatedAt: now }).where(eq(photos.id, id));
    return photo.uri;
  },

  /** Borra todas las fotos (agitar el teléfono). Devuelve las uris de los archivos. */
  async softDeleteAll(): Promise<string[]> {
    const rows = await db.select({ uri: photos.uri }).from(photos).where(alive);
    const now = new Date();
    await db.update(photos).set({ deletedAt: now, updatedAt: now }).where(alive);
    return rows.map((r) => r.uri);
  },

  /** Elimina la fila de verdad. Solo cuando el borrado ya llegó a la nube (o nunca subió). */
  async purge(id: number) {
    await db.delete(photos).where(eq(photos.id, id));
  },

  // ---------- Semana 9: soporte para la sincronización ----------

  /** Pendientes: nunca sincronizadas, editadas después de la última subida, o lápidas. */
  pendingQuery() {
    return db
      .select()
      .from(photos)
      .where(
        or(
          isNull(photos.syncedAt),
          gt(photos.updatedAt, photos.syncedAt),
          isNotNull(photos.deletedAt)
        )
      )
      .orderBy(asc(photos.createdAt));
  },

  async listPending() {
    return await photosRepo.pendingQuery();
  },

  async findByClientId(clientId: string) {
    return await db.select().from(photos).where(eq(photos.clientId, clientId)).get();
  },

  /** Foto que llegó de la nube: se inserta ya sincronizada. */
  async insertFromRemote(data: NewPhoto) {
    await db.insert(photos).values(data);
  },

  /** Aplica en local una versión más nueva de la nube. Nunca usa la hora actual. */
  async applyRemote(
    id: number,
    changes: { note: string | null; favorite: boolean; updatedAt: Date; syncedAt: Date }
  ) {
    await db.update(photos).set(changes).where(eq(photos.id, id));
  },

  /** Marca la foto como subida. syncedAt es la versión (updatedAt) que se subió, no "ahora". */
  async markSynced(id: number, remotePath: string, syncedAt: Date) {
    await db.update(photos).set({ remotePath, syncedAt }).where(eq(photos.id, id));
  },

  /** Semana 8: rellena clientId y updatedAt en las fotos anteriores a la migración. */
  async ensureSyncFields() {
    const rows = await db.select().from(photos).where(isNull(photos.clientId));
    for (const row of rows) {
      await db
        .update(photos)
        .set({ clientId: Crypto.randomUUID(), updatedAt: row.updatedAt ?? row.createdAt })
        .where(eq(photos.id, row.id));
    }
  },
};
