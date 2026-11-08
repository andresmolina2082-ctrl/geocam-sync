// db/repositories/albums.ts
import { asc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { albums } from '@/db/schema';

export const albumsRepo = {
  listQuery() {
    return db.select().from(albums).orderBy(asc(albums.name));
  },

  async create(name: string) {
    await db.insert(albums).values({ name: name.trim() });
  },

  /** Las fotos del álbum NO se borran: la llave foránea las deja con albumId = null. */
  async remove(id: number) {
    await db.delete(albums).where(eq(albums.id, id));
  },
};
