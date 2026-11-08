# GeoCam sincronizada 📍📷🔄

**Taller Integrador 2 · Semana 9: GeoCam sincronizada.**
Programación Móvil Avanzada · Universidad de La Guajira.

La app funciona sin conexión. Cuando vuelve la red, sube sola lo pendiente (fotos nuevas, ediciones **y borrados**) y baja lo que se creó, editó o borró en otro teléfono con la misma cuenta. La pestaña **Nube** muestra un feed paginado de lo que hay en Supabase, consumido con TanStack Query.

**Versiones:** Expo SDK 57 · Drizzle ORM 0.45 · supabase-js 2 · TanStack Query 5 · expo-network · Vitest 3.

## Cómo ejecutarlo

1. **Supabase.** En el SQL Editor ejecuta, en este orden:
   1. `supabase/schema.sql` (Semana 8)
   2. `supabase/semana9.sql` (cursor de bajada)
   3. `supabase/borrados.sql` (**nuevo:** borrado lógico + índice del feed)
2. **Credenciales.** Copia `.env.example` como `.env` y pon la URL y la publishable key.
3. **Instalar y correr.** La migración local ya está generada en `drizzle/`.

   ```bash
   npm install
   npx expo start -c
   ```

4. **Pruebas automáticas** (no necesitan teléfono ni Supabase):

   ```bash
   npm test
   ```

> Usa su propia base local (`geocam-sync.db`). Si ya habías corrido una versión anterior en el teléfono, borra los datos de la app (o desinstálala) para que se aplique la migración nueva desde cero.

## Diseño de la sincronización

1. **SQLite es la fuente de verdad.** Las pantallas siempre leen y escriben en local.
2. **Identidad compartida:** cada foto tiene un `clientId` (UUID) igual en el teléfono y en la nube.
3. **Pendiente** = `syncedAt` vacío, `updatedAt` posterior a `syncedAt`, **o `deletedAt` con valor**.
4. **Cursor de bajada** por usuario (`server_updated_at`), guardado en la tabla local `sync_meta`.
5. **Conflictos de edición:** gana el último cambio (`updatedAt` más reciente).
6. **Borrado vs. edición:** **gana el borrado**, en el teléfono y en el servidor (trigger).

Cada ciclo (`syncAll` en `services/sync.ts`) hace dos pasos, en este orden:

```text
1. BAJAR   filas con server_updated_at > cursor, de a 200 hasta agotarlas
           ├─ borrada en la nube       → borrar archivo + fila local (si existe)
           ├─ no existe en local        → descargar archivo + insertar
           ├─ borrada aquí (lápida)     → no tocar (se sube en el paso 2)
           ├─ remota más nueva          → actualizar local
           └─ local más nueva           → no tocar (se sube en el paso 2)
2. SUBIR   fotos pendientes
           ├─ lápida que nunca subió    → eliminar la fila local, sin red
           ├─ lápida ya subida          → upsert con deleted_at → borrar archivo del bucket → eliminar fila local
           └─ foto nueva o editada      → archivo (solo la 1.ª vez) → upsert por client_id → syncedAt = updatedAt subido
```

### Borrados: por qué borrado lógico

Si la app borrara la fila en Supabase con `DELETE`, el otro teléfono nunca se enteraría: el cursor solo encuentra filas que **existen** y cambiaron. Por eso:

- **En el teléfono**, borrar pone `deletedAt` (una "lápida"). Todas las consultas de pantalla filtran `deletedAt IS NULL`, así que la foto desaparece al instante, y el archivo local se borra de una vez. La fila se elimina de verdad (`purge`) solo cuando el borrado ya llegó a la nube.
- **En la nube**, la fila queda con `deleted_at` y su `server_updated_at` avanza, así que los demás teléfonos la reciben con su cursor y la borran. El archivo del bucket sí se elimina.
- **El borrado gana.** Si otro teléfono, sin saber del borrado, sube después una edición, el trigger de `borrados.sql` conserva `deleted_at`. Ese teléfono baja la fila borrada en su siguiente ciclo y la elimina.
- **Un teléfono nuevo** recibe las filas borradas, pero no descarga nada de ellas: las fotos borradas no resucitan.

| Columna remota | Quién la escribe | Para qué sirve |
| --- | --- | --- |
| `updated_at` | El teléfono | Decidir quién gana un conflicto de edición |
| `server_updated_at` | PostgreSQL (trigger) | Cursor de bajada |
| `deleted_at` | El teléfono (y el trigger la conserva) | Avisar el borrado a los demás teléfonos |

## Feed paginado de la nube (pestaña Nube)

`services/cloudFeed.ts` → `hooks/useCloudFeed.ts` → `app/(tabs)/nube.tsx`

- **`useInfiniteQuery`** con paginación por **cursor** (`id < último id`, 12 por página). A diferencia de `offset`, no repite ni salta fotos si otro teléfono sube una mientras navegas.
- Solo fotos vivas (`deleted_at is null`) del usuario (RLS). Índice parcial `photos_feed_idx`.
- Miniaturas del bucket privado con **una sola** petición `createSignedUrls` por página.
- Búsqueda por nota con *debounce* (`useDebouncedValue`) y filtro de favoritas; cada filtro tiene su caché y `keepPreviousData` evita el parpadeo.
- **Se refresca solo** cuando un ciclo de sincronización sube, baja o borra algo (`invalidateCloudFeed` en `hooks/useSync.ts`), al volver la red y al volver a primer plano.
- Tocar una foto abre su detalle si ya está en el teléfono.

### Manejadores de UI

`lib/feedView.ts` traduce el estado de TanStack Query al estado de pantalla. Es una función pura, así que cada estado tiene su prueba en `tests/feedView.test.ts`.

| Situación | Qué se ve |
| --- | --- |
| Primera carga | Indicador de carga |
| Sin red y sin datos (consulta en pausa) | "Sin conexión", y carga sola al volver la red |
| Falla la primera carga | Mensaje de error + **Reintentar** |
| Nube vacía | "Tu nube está vacía" |
| Búsqueda/filtro sin resultados | "Ninguna foto coincide" |
| Bajando por la lista | *Infinite scroll* con indicador al pie |
| Falla la página siguiente | La lista sigue visible; al pie, **Toca para reintentar** |
| Última página | "No hay más fotos en la nube" |
| Sin red con datos en caché | Lista visible + aviso ámbar; el pie dice "Conéctate para ver más" |
| Falla una recarga en segundo plano | Lista visible + aviso rojo tocable para reintentar |
| Archivo faltante en el bucket | Miniatura de reemplazo, sin romper la página |
| Deslizar hacia abajo | Refrescar (*pull to refresh*) |

## Cuándo se dispara la sincronización

`hooks/useSync.ts` trata la sincronización como una consulta de TanStack Query:

| Disparador | Cómo |
| --- | --- |
| Al iniciar sesión o abrir la app | `enabled: !!userId` |
| Al recuperar la red | `refetchOnReconnect: 'always'` + `onlineManager` |
| Al volver a primer plano | `refetchOnWindowFocus: 'always'` + `focusManager` |
| Después de cada cambio local (crear, editar, **borrar**, agitar) | `requestSync()` en `hooks/usePhotos.ts` |
| A mano | Tocar el indicador de estado |

## Pruebas automáticas: evidencia de que el diseño funciona

`npm test` ejecuta **34 pruebas** con Vitest. No usan copias de la lógica: corren el código real de `services/sync.ts`, `services/cloudFeed.ts`, `lib/feedView.ts` y los repositorios de Drizzle.

**Cómo se simula el mundo** (`tests/harness/`):

- **Teléfonos:** cada uno tiene una base **SQLite real** en memoria (`node:sqlite`), creada con la misma migración de `drizzle/` que usa la app, y su propia carpeta de archivos.
- **Supabase:** un servidor en memoria (`fakeSupabase.ts`) con lo que el diseño necesita del real: `client_id` único, RLS por usuario, `upsert` que solo actualiza las columnas enviadas (como PostgREST), el trigger de `server_updated_at` y `deleted_at`, el bucket privado, fallas inyectables y un gancho para que el "usuario" edite o borre a mitad de una subida.

```text
 ✓ tests/feedView.test.ts (10 tests)
 ✓ tests/cloudFeed.test.ts (8 tests)
 ✓ tests/sync.test.ts (16 tests)
 Test Files  3 passed (3)
      Tests  34 passed (34)
```

| Archivo | Escenarios |
| --- | --- |
| `tests/sync.test.ts` | Subir y verlo en el otro teléfono · repetir sin duplicar · llamadas simultáneas · bajar más de 200 cambios en un ciclo · conflicto en los dos órdenes · edición durante la subida · falla a mitad y reintento · **borrar y propagar** · borrar una foto que nunca subió · **teléfono nuevo sin fotos resucitadas** · **borrado gana a edición posterior (los dos órdenes)** · borrar durante la subida · agitar para borrar todo · falla al subir un borrado |
| `tests/cloudFeed.test.ts` | Páginas de tamaño fijo y fin · sin borradas · cursor estable con subidas concurrentes · búsqueda y favoritas · firmas por lote y archivo faltante · RLS · error de red · nube vacía |
| `tests/feedView.test.ts` | Los 10 estados de UI de la tabla anterior |

**¿Las pruebas detectan errores de verdad?** Se rompió el código a propósito y se volvió a correr la suite:

| Error introducido en `services/sync.ts` | Resultado |
| --- | --- |
| Ignorar los borrados que llegan de la nube | 6 pruebas fallan |
| Marcar `syncedAt` con la hora actual en vez de la versión subida | Falla "una edición hecha durante la subida no se pierde" |

**Lo que NO cubren:** no corren en un teléfono ni contra un proyecto real de Supabase. La UI de React Native (pantallas) se verificó con `tsc`, no con pruebas de render. Para eso están las pruebas manuales de abajo.

## Pruebas manuales en dos teléfonos

- [ ] **Sin conexión.** Modo avión, toma dos fotos y edita una nota. El indicador muestra las pendientes. Quita el modo avión: se suben solas y pasa a "Al día".
- [ ] **Dos teléfonos.** Inicia sesión con la misma cuenta en otro teléfono. Las fotos aparecen con imagen y ubicación en el mapa.
- [ ] **Conflicto.** Con ambos en modo avión, edita la nota de la misma foto, primero en A y un minuto después en B. Reconecta ambos: en los dos queda la nota de B.
- [ ] **Borrado.** Borra una foto en A: desaparece en A, en la pestaña Nube y, tras sincronizar, en B. En Supabase la fila tiene `deleted_at` y el archivo ya no está en el bucket.
- [ ] **Borrado sin red.** En modo avión, borra una foto en A. El indicador la cuenta como pendiente. Al reconectar se borra en la nube.
- [ ] **Borrado gana.** Ambos en modo avión: borra en A y luego edita la misma foto en B. Reconecta ambos: la foto no queda en ninguno.
- [ ] **Agitar.** Agita A para borrar todo: B queda vacío tras sincronizar.
- [ ] **Feed.** Con más de 12 fotos, baja en la pestaña Nube: se cargan de a 12. Activa modo avión: aviso ámbar y la lista sigue. Busca por nota y filtra favoritas.
- [ ] **Sin duplicados.** Toca el indicador varias veces seguidas: en Supabase sigue habiendo una fila y un archivo por foto.

## Requisitos del taller

- [x] **T1. Backend:** `supabase/semana9.sql` + `supabase/borrados.sql`.
- [x] **T2. TanStack Query:** `lib/queryClient.ts` y `QueryClientProvider` en `app/_layout.tsx`.
- [x] **T3. Soporte local:** tabla `sync_meta`, `db/repositories/syncMeta.ts` y los métodos de `photosRepo`.
- [x] **T4. Bajar:** `pull` en `services/sync.ts` (con paginación y borrados).
- [x] **T5. Subir:** `push` en `services/sync.ts` (con borrados).
- [x] **T6. Disparo automático y estado:** `hooks/useSync.ts` y `components/SyncBadge.tsx`.
- [x] **T7. Verificación:** pruebas automáticas (`npm test`) + lista manual de arriba.
- [x] **C1. Borrados sincronizados:** borrado lógico en ambos lados.
- [x] **Feed de la nube** con `useInfiniteQuery` y todos los estados de UI.

## Limitaciones conocidas

- **Si una foto falla al subir, el ciclo se detiene** y se reintenta completo (incluye fotos antiguas cuyo archivo ya no existe). Los borrados no se bloquean por esto: no necesitan el archivo.
- **Solo se sincronizan nota, favorita y borrado.** Los álbumes son locales.
- **Las filas borradas se quedan en la nube** (sin archivo). Se podrían limpiar con un trabajo programado pasado un tiempo prudente.
- **Las fotos locales no se separan por usuario** (tarea C5 de la Semana 8).

## Documentación

- [TanStack Query en React Native](https://tanstack.com/query/latest/docs/framework/react/react-native)
- [Consultas infinitas](https://tanstack.com/query/latest/docs/framework/react/guides/infinite-queries)
- [Modos de red](https://tanstack.com/query/latest/docs/framework/react/guides/network-mode)
- [Expo Network](https://docs.expo.dev/versions/latest/sdk/network/)
- [Expo FileSystem](https://docs.expo.dev/versions/latest/sdk/filesystem/)
