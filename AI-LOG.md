# 🤖 Registro de Auditoría de IA (AI-LOG)

**Estudiante(s):** Nombre Apellido, Nombre Apellido
**Semana:** 9
**Proyecto:** GeoCam sincronizada – Taller Integrador 2

## 1. Prompts Utilizados

- "Completa la sincronización con los borrados, agrega el feed paginado de la nube y documenta con pruebas que el diseño funciona."
- "Entrega el enlace al repositorio de GitHub con el feed de la nube consumido con TanStack Query, con manejadores de UI completos, más la sincronización en dos sentidos entre SQLite y Supabase."

## 2. Código Generado vs. Código Modificado

- **¿Qué generó la IA?:**
  - Borrado lógico: columna `deletedAt` (local) y `deleted_at` (Supabase, `supabase/borrados.sql`), métodos `softDelete`, `softDeleteAll` y `purge` en `photosRepo`, y el manejo de borrados en `pull` y `push` de `services/sync.ts`.
  - Bajada por páginas (más de 200 cambios en un ciclo).
  - Feed de la nube: `services/cloudFeed.ts`, `hooks/useCloudFeed.ts`, `lib/feedView.ts`, `app/(tabs)/nube.tsx`.
  - Pruebas con Vitest (`tests/`): servidor de Supabase simulado y teléfonos con SQLite real en memoria.
- **¿Qué modifiqué/corregí?:**
  - (Completar por el estudiante.)

## 3. Alucinaciones o Errores Detectados

- `db/schema.ts` importaba `expo-crypto`, y por eso `drizzle-kit generate` fallaba (no puede cargar React Native). El UUID se movió a `photosRepo.create`.
- Una prueba falló al principio por un error de la propia prueba: dos fotos se tomaban en el mismo milisegundo con el reloj congelado. Se corrigió avanzando el reloj en cada foto.
- Para comprobar que las pruebas detectan errores reales, se rompió el código a propósito (ver el README). Un cambio no hizo fallar ninguna prueba: quitar la rama "lápida local" de `pull`. Al revisarlo se vio que el resultado final es el mismo, porque `push` sube el borrado igual. Esa rama es defensiva.
