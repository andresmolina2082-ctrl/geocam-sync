// tests/harness/server.ts
// Instancia compartida del servidor simulado. Cada prueba crea uno nuevo con resetServer().
import { FakeSupabase } from './fakeSupabase';

export const server = { current: new FakeSupabase() };

export function resetServer() {
  server.current = new FakeSupabase();
  return server.current;
}
