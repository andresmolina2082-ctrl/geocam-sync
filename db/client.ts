// db/client.ts
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';
import * as schema from './schema';

// enableChangeListener: true permite que useLiveQuery se actualice solo
export const expoDb = openDatabaseSync('geocam-sync.db', { enableChangeListener: true });

// Se activa desde ya para el trabajo en casa (tabla albums con llave foránea)
expoDb.execSync('PRAGMA foreign_keys = ON;');

export const db = drizzle(expoDb, { schema });
