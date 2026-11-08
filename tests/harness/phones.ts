// tests/harness/phones.ts
// Teléfonos simulados. Cada uno tiene su propia base SQLite REAL (node:sqlite, en memoria)
// creada con la migración que genera drizzle-kit (drizzle/*.sql), y su propia carpeta de archivos.
// La app usa @/db/client; en las pruebas ese módulo apunta al teléfono "activo".
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import * as schema from '@/db/schema';

const migrationDir = join(__dirname, '..', '..', 'drizzle');

function migrationStatements(): string[] {
  return readdirSync(migrationDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .flatMap((f) => readFileSync(join(migrationDir, f), 'utf8').split('--> statement-breakpoint'))
    .map((s) => s.trim())
    .filter(Boolean);
}

export interface Phone {
  name: string;
  sqlite: DatabaseSync;
  db: ReturnType<typeof makeDrizzle>;
  /** Archivos de fotos que existen en este teléfono. */
  files: Set<string>;
}

function makeDrizzle(sqlite: DatabaseSync) {
  return drizzle(
    async (sql, params, method) => {
      const stmt = sqlite.prepare(sql);
      stmt.setReturnArrays(true);
      const args = params as any[];
      if (method === 'run') {
        stmt.run(...args);
        return { rows: [] };
      }
      if (method === 'get') return { rows: stmt.get(...args) as any };
      return { rows: stmt.all(...args) as any[] };
    },
    { schema }
  );
}

export function createPhone(name: string): Phone {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON;');
  for (const statement of migrationStatements()) sqlite.exec(statement);
  return { name, sqlite, db: makeDrizzle(sqlite), files: new Set() };
}

let active: Phone | null = null;

export function activePhone(): Phone {
  if (!active) throw new Error('No hay teléfono activo: usa onPhone()');
  return active;
}

/** Ejecuta código "en" un teléfono (las llamadas a @/db/client van a su base). */
export async function onPhone<T>(phone: Phone, fn: () => Promise<T>): Promise<T> {
  const previous = active;
  active = phone;
  try {
    return await fn();
  } finally {
    active = previous;
  }
}

/** Proxy que la app ve como `db`: reenvía cada llamada a la base del teléfono activo. */
export const dbProxy = new Proxy(
  {},
  {
    get(_target, key) {
      const db = activePhone().db as any;
      const value = db[key];
      return typeof value === 'function' ? value.bind(db) : value;
    },
  }
);
