// db/schema.ts
// Semana 7 – Trabajo para la casa + Semana 8 – columnas para la nube + Semana 9 – sync_meta.
// C1: tabla albums + photos.albumId (llave foránea opcional, set null al borrar el álbum).
// C2: columnas note y favorite en photos (segunda migración).
import { sqliteTable, integer, real, text } from 'drizzle-orm/sqlite-core';

export const albums = sqliteTable('albums', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const photos = sqliteTable('photos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  uri: text('uri').notNull(),
  latitude: real('latitude'),
  longitude: real('longitude'),
  accuracy: real('accuracy'),
  source: text('source', { enum: ['camera', 'gallery'] }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),

  // C1: opcional. Al borrar el álbum, la foto queda sin álbum (no se borra)
  albumId: integer('album_id').references(() => albums.id, { onDelete: 'set null' }),

  // C2: segunda migración
  note: text('note'),
  favorite: integer('favorite', { mode: 'boolean' }).notNull().default(false),

  // Semana 8 (T4): columnas para la nube. Son opcionales porque SQLite no permite
  // agregar una columna obligatoria sin valor constante a una tabla que ya tiene filas.
  // Identidad compartida con la nube: el id autoincremental solo vale en este teléfono.
  // El UUID lo genera photosRepo.create: así este archivo no depende de React Native
  // y drizzle-kit puede leerlo para generar la migración.
  clientId: text('client_id').unique(),
  // Última modificación hecha por el usuario
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
  // Ruta del archivo en el bucket y versión que quedó sincronizada
  remotePath: text('remote_path'),
  syncedAt: integer('synced_at', { mode: 'timestamp_ms' }),

  // Semana 9 (C1): borrado lógico. La fila queda como "lápida" hasta que el borrado
  // llega a la nube; después se elimina de verdad. Las pantallas nunca la muestran.
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
});

// Semana 9 (T3): datos de la sincronización, como el cursor de bajada de cada usuario
export const syncMeta = sqliteTable('sync_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export type Album = typeof albums.$inferSelect;
export type Photo = typeof photos.$inferSelect;
export type NewPhoto = typeof photos.$inferInsert;
