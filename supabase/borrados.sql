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
