// lib/secureStorage.ts
// Adaptador de almacenamiento para Supabase sobre SecureStore.
// La sesión suele superar el límite de ~2048 bytes por valor, así que se guarda por fragmentos.
import * as SecureStore from 'expo-secure-store';

const CHUNK_SIZE = 1000;
const countKey = (key: string) => `${key}.chunks`;
const chunkKey = (key: string, i: number) => `${key}.${i}`;

async function readCount(key: string) {
  return Number((await SecureStore.getItemAsync(countKey(key))) ?? 0);
}

async function removeItem(key: string) {
  const count = await readCount(key);
  for (let i = 0; i < count; i++) await SecureStore.deleteItemAsync(chunkKey(key, i));
  await SecureStore.deleteItemAsync(countKey(key));
}

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    const count = await readCount(key);
    if (count === 0) return null;
    let value = '';
    for (let i = 0; i < count; i++) {
      const chunk = await SecureStore.getItemAsync(chunkKey(key, i));
      if (chunk === null) return null; // sesión incompleta: se trata como cerrada
      value += chunk;
    }
    return value;
  },

  async setItem(key: string, value: string): Promise<void> {
    await removeItem(key);
    const total = Math.ceil(value.length / CHUNK_SIZE);
    for (let i = 0; i < total; i++) {
      await SecureStore.setItemAsync(chunkKey(key, i), value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
    }
    await SecureStore.setItemAsync(countKey(key), String(total));
  },

  removeItem,
};
