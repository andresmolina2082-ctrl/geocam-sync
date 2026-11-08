import { defineConfig } from 'drizzle-kit';

// driver: 'expo' es obligatorio: sin él drizzle-kit no genera drizzle/migrations.js
export default defineConfig({
  dialect: 'sqlite',
  driver: 'expo',
  schema: './db/schema.ts',
  out: './drizzle',
});
