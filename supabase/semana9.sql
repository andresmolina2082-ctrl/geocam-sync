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
