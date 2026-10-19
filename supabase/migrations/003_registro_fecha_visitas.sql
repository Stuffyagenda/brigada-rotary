-- =====================================================================
-- Brigada Rotary · Migración 003: registro abierto, fecha del reporte y visitas
-- Ejecutar en: Dashboard → SQL Editor → New query → Run (después de
-- schema.sql y 002_realtime.sql). Se puede volver a ejecutar sin errores.
--
-- 1. profiles: columnas nombre y apellido.
-- 2. handle_new_user(): el perfil se crea con nombre, apellido y club del registro.
-- 3. protect_profile_fields(): el miembro edita su nombre; rol, club y activo, solo admin.
-- 4. clubs_publicos(): lista de clubes para la pantalla de registro (sin sesión).
-- 5. reportes.fecha_reporte: fecha del reporte (zona America/Panama).
-- 6. visitas: entregas posteriores a una familia ya registrada (historial).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. profiles: nombre y apellido
-- ---------------------------------------------------------------------

alter table public.profiles add column if not exists nombre   text;
alter table public.profiles add column if not exists apellido text;

-- Perfiles existentes: el nombre completo pasa a `nombre` tal cual (no se
-- intenta partir el apellido); `apellido` queda null. Desde el SQL Editor no
-- hay sesión, así que el trigger de protección no lo impide.
update public.profiles
   set nombre = nombre_completo
 where nombre is null
   and nombre_completo is not null;

-- ---------------------------------------------------------------------
-- 2. Alta de usuario: perfil con los datos del formulario de registro
-- ---------------------------------------------------------------------
-- La app llama a `supabase.auth.signUp({ email, password,
--   options: { data: { nombre, apellido, club_id } } })`; esos datos llegan en
-- `raw_user_meta_data`. Son datos que escribe el propio usuario, así que:
--   - `club_id` solo se usa si es un uuid válido Y existe en `clubs` (si no,
--     null: un club inventado nunca hace fallar el alta por la FK);
--   - los textos se recortan y se limitan a 120 caracteres;
--   - rol y activo NO se leen de los metadatos: siempre `miembro` y activo
--     (registro abierto sin aprobación; el admin puede desactivar en /miembros).
-- Fallbacks de nombre_completo (usuarios creados desde el dashboard):
-- nombre_completo, full_name y la parte local del correo.

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  meta       jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_nombre   text  := left(nullif(btrim(meta ->> 'nombre'), ''), 120);
  v_apellido text  := left(nullif(btrim(meta ->> 'apellido'), ''), 120);
  v_club_txt text  := nullif(btrim(meta ->> 'club_id'), '');
  v_club     uuid;
  v_completo text;
begin
  if v_club_txt ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select c.id into v_club from public.clubs c where c.id = v_club_txt::uuid;
  end if;

  v_completo := coalesce(
    nullif(btrim(concat_ws(' ', v_nombre, v_apellido)), ''),
    left(nullif(btrim(meta ->> 'nombre_completo'), ''), 240),
    left(nullif(btrim(meta ->> 'full_name'), ''), 240),
    split_part(new.email, '@', 1)
  );

  insert into public.profiles (id, nombre, apellido, nombre_completo, club_id)
  values (
    new.id,
    -- Igual que en los perfiles existentes: sin nombre explícito, el completo.
    coalesce(v_nombre, v_completo),
    v_apellido,
    v_completo,
    v_club
  );
  return new;
end;
$$;

-- El trigger `on_auth_user_created` (schema.sql) ya llama a esta función.

-- ---------------------------------------------------------------------
-- 3. Protección de campos del perfil
-- ---------------------------------------------------------------------
-- Un miembro puede cambiar su nombre, apellido y nombre_completo, pero no su
-- rol, club ni estado activo (eso solo un admin). Desde el SQL Editor no hay
-- sesión (auth.uid() es null) y se permite todo.
-- Si cambia nombre o apellido y no se envía un nombre_completo distinto, este se
-- recalcula para que siga coherente (lo usan el menú de cuenta y el brigadista
-- por defecto de los reportes). `created_at` no se puede cambiar.

create or replace function public.protect_profile_fields()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and not public.is_admin() then
    if new.rol is distinct from old.rol
       or new.club_id is distinct from old.club_id
       or new.activo is distinct from old.activo then
      raise exception 'Solo un administrador puede cambiar rol, club o estado activo.';
    end if;
  end if;

  if (new.nombre is distinct from old.nombre or new.apellido is distinct from old.apellido)
     and new.nombre_completo is not distinct from old.nombre_completo then
    new.nombre_completo := coalesce(
      nullif(btrim(concat_ws(' ', new.nombre, new.apellido)), ''),
      new.nombre_completo
    );
  end if;

  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;

-- El trigger `profiles_protect_fields` (schema.sql) ya llama a esta función.

-- ---------------------------------------------------------------------
-- 4. Clubes públicos (para el formulario de registro)
-- ---------------------------------------------------------------------
-- La tabla `clubs` sigue cerrada para `anon`; esta función (security definer)
-- expone solo id, nombre y tipo. Uso: `supabase.rpc('clubs_publicos')`.

create or replace function public.clubs_publicos()
returns table (id uuid, nombre text, tipo text)
language sql stable security definer set search_path = ''
as $$
  select c.id, c.nombre, c.tipo
    from public.clubs c
   order by c.nombre;
$$;

revoke all on function public.clubs_publicos() from public;
grant execute on function public.clubs_publicos() to anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. Fecha del reporte
-- ---------------------------------------------------------------------
-- Fecha (sin hora) que el brigadista asigna al reporte; por defecto hoy en
-- Panamá. Se añade nullable, se rellena con la fecha de creación en hora de
-- Panamá y luego pasa a not null.
-- El relleno desactiva un momento el trigger de auditoría para no tocar
-- `updated_at`/`updated_by` de todos los reportes.
-- Default: la fecha de hoy en America/Panama (el servidor de Supabase está en
-- UTC; `current_date` daría el día siguiente después de las 19:00 en Panamá).

alter table public.reportes add column if not exists fecha_reporte date;

alter table public.reportes disable trigger reportes_audit;
update public.reportes
   set fecha_reporte = (created_at at time zone 'America/Panama')::date
 where fecha_reporte is null;
alter table public.reportes enable trigger reportes_audit;

alter table public.reportes
  alter column fecha_reporte set default ((now() at time zone 'America/Panama')::date),
  alter column fecha_reporte set not null;

-- No puede ser futura. Se tolera un día por los relojes de los celulares
-- (la app ya valida "no futura" contra la fecha de hoy en Panamá).
alter table public.reportes drop constraint if exists reportes_fecha_no_futura;
alter table public.reportes
  add constraint reportes_fecha_no_futura
  check (fecha_reporte <= (now() at time zone 'America/Panama')::date + 1);

-- ---------------------------------------------------------------------
-- 6. Visitas (historial de entregas posteriores)
-- ---------------------------------------------------------------------
-- Una visita es una nueva entrega a una familia ya registrada. La app genera
-- el id (UUID) en el celular, así que el upsert por id es idempotente.
-- Al guardar una visita, la app también actualiza el reporte (estado ATENDIDO,
-- attended_at = visitado_at, ent_* y observaciones_atencion de la visita) y
-- envía ese upsert ANTES que el de la visita (FK).
-- Borrar un reporte borra sus visitas (on delete cascade).

create table if not exists public.visitas (
  id                uuid primary key default gen_random_uuid(),
  reporte_id        uuid not null references public.reportes (id) on delete cascade,
  fecha             date not null default ((now() at time zone 'America/Panama')::date),
  visitado_at       timestamptz not null default now(),
  brigadista_texto  text,

  ent_agua          boolean not null default false,
  ent_kit_alimento  boolean not null default false,
  ent_kit_higiene   boolean not null default false,
  ent_lona          boolean not null default false,
  ent_camping       boolean not null default false,
  ent_toldas        boolean not null default false,
  ent_colchonetas   boolean not null default false,
  ent_otros         text[] not null default '{}',
  observaciones     text,

  created_at        timestamptz not null default now(),
  created_by        uuid references public.profiles (id) on delete set null,

  -- Igual que en reportes: no futura (con un día de tolerancia).
  constraint visitas_fecha_no_futura
    check (fecha <= (now() at time zone 'America/Panama')::date + 1)
);

create index if not exists visitas_reporte_fecha_idx on public.visitas (reporte_id, fecha desc);

-- Auditoría: `created_by` = usuario de la sesión al insertar; en un update
-- (p. ej. el upsert repetido de un reintento) se conservan autor y fecha de alta.
create or replace function public.set_visita_audit()
returns trigger
language plpgsql set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if tg_op = 'INSERT' then
    if uid is not null then
      new.created_by := uid;
    end if;
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

drop trigger if exists visitas_audit on public.visitas;
create trigger visitas_audit
  before insert or update on public.visitas
  for each row execute function public.set_visita_audit();

-- Permisos: miembros activos leen, crean y editan; solo un admin borra.
alter table public.visitas enable row level security;

revoke all on public.visitas from anon;
grant select, insert, update, delete on public.visitas to authenticated;

drop policy if exists "visitas: miembros leen"     on public.visitas;
drop policy if exists "visitas: miembros crean"    on public.visitas;
drop policy if exists "visitas: miembros editan"   on public.visitas;
drop policy if exists "visitas: solo admin borra"  on public.visitas;

create policy "visitas: miembros leen" on public.visitas
  for select to authenticated using (public.is_active_member());
create policy "visitas: miembros crean" on public.visitas
  for insert to authenticated with check (public.is_active_member());
create policy "visitas: miembros editan" on public.visitas
  for update to authenticated using (public.is_active_member()) with check (public.is_active_member());
create policy "visitas: solo admin borra" on public.visitas
  for delete to authenticated using (public.is_admin());

-- Realtime: publicar los cambios de visitas (sin fallar si ya estaba publicada).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'visitas'
     ) then
    alter publication supabase_realtime add table public.visitas;
  end if;
end;
$$;

commit;
