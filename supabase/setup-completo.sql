-- ===================== supabase/schema.sql =====================
-- GeoCam en la nube · Semana 8 (T3)
-- Ejecutar una sola vez en el SQL Editor del proyecto de Supabase.

create table public.photos (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  client_id uuid not null unique,      -- UUID creado en el teléfono: identifica la misma foto en ambos lados
  storage_path text not null unique,
  latitude double precision,
  longitude double precision,
  note text,
  favorite boolean not null default false,
  source text not null check (source in ('camera', 'gallery')),
  taken_at timestamptz not null,
  updated_at timestamptz not null,     -- última modificación hecha por el usuario (base de la Semana 9)
  created_at timestamptz not null default now()
);

alter table public.photos enable row level security;

-- Cada usuario solo ve, crea y borra sus propias filas
create policy "ver las mías" on public.photos
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "crear las mías" on public.photos
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "borrar las mías" on public.photos
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Bucket privado: sin política de lectura nadie puede ver los archivos
insert into storage.buckets (id, name, public) values ('geocam', 'geocam', false);

create policy "subir a mi carpeta" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'geocam' and (storage.foldername(name))[1] = (select auth.uid()::text));

create policy "leer mi carpeta" on storage.objects
  for select to authenticated
  using (bucket_id = 'geocam' and (storage.foldername(name))[1] = (select auth.uid()::text));

create policy "borrar de mi carpeta" on storage.objects
  for delete to authenticated
  using (bucket_id = 'geocam' and (storage.foldername(name))[1] = (select auth.uid()::text));

-- ===================== supabase/semana9.sql =====================
-- GeoCam sincronizada · Semana 9 (T1)
-- Ejecutar DESPUÉS de schema.sql (Semana 8), una sola vez, en el SQL Editor.

-- Reloj del servidor: cuándo llegó cada cambio a Supabase (cursor de bajada)
alter table public.photos
  add column server_updated_at timestamptz not null default now();

create or replace function public.touch_server_updated_at()
returns trigger language plpgsql as $$
begin
  new.server_updated_at = now();
  return new;
end;
$$;

create trigger photos_touch_server_updated_at
  before insert or update on public.photos
  for each row execute function public.touch_server_updated_at();

create index photos_user_server_updated_idx
  on public.photos (user_id, server_updated_at);

-- upsert necesita permiso de actualizar, además de insertar y leer
create policy "editar las mías" on public.photos
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ===================== supabase/borrados.sql =====================
-- GeoCam sincronizada · Borrados sincronizados (C1) + feed de la nube
-- Ejecutar DESPUÉS de schema.sql y semana9.sql, una sola vez, en el SQL Editor.

-- 1. Borrado lógico: la fila no se elimina, se marca. Así los demás teléfonos
--    se enteran del borrado por el mismo cursor (server_updated_at) que usan para los cambios.
alter table public.photos
  add column deleted_at timestamptz;

-- 2. El borrado gana: una vez marcada, ninguna subida posterior la "revive".
--    (Un teléfono que aún no se enteró del borrado puede subir una edición vieja.)
create or replace function public.touch_server_updated_at()
returns trigger language plpgsql as $$
begin
  new.server_updated_at = now();
  if tg_op = 'UPDATE' and old.deleted_at is not null then
    new.deleted_at = old.deleted_at;
  end if;
  return new;
end;
$$;

-- 3. Índice para el feed paginado: fotos vivas del usuario, de la más reciente a la más antigua
create index photos_feed_idx
  on public.photos (user_id, id desc)
  where deleted_at is null;

