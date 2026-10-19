-- =====================================================================
-- Brigada Rotary · Schema de Supabase
-- Ejecutar una sola vez en: Dashboard → SQL Editor → New query → Run
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tablas
-- ---------------------------------------------------------------------

-- Clubes: Rotary (adultos) y Rotaract (jóvenes).
create table public.clubs (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null unique,
  tipo        text not null check (tipo in ('rotary', 'rotaract')),
  provincia   text,
  created_at  timestamptz not null default now()
);

-- Perfil de cada miembro. Se crea solo al dar de alta un usuario en Auth.
create table public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  nombre_completo  text,
  club_id          uuid references public.clubs (id) on delete set null,
  rol              text not null default 'miembro' check (rol in ('admin', 'miembro')),
  activo           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Reportes de viviendas / familias (equivale a la hoja "Reportes").
create table public.reportes (
  id                      uuid primary key default gen_random_uuid(),
  created_at              timestamptz not null default now(),
  attended_at             timestamptz,
  updated_at              timestamptz not null default now(),

  club_id                 uuid references public.clubs (id) on delete set null,
  created_by              uuid references public.profiles (id) on delete set null,
  updated_by              uuid references public.profiles (id) on delete set null,
  brigadista_texto        text,  -- texto libre heredado de la columna "Brigadista"

  estado                  text not null default 'PENDIENTE'
                            check (estado in ('PENDIENTE', 'ATENDIDO')),
  prioridad               text not null default 'MEDIA'
                            check (prioridad in ('ALTA', 'MEDIA', 'BAJA')),
  danio_vivienda          text not null default 'MENOR / HABITABLE'
                            check (danio_vivienda in ('NINGUNO', 'MENOR / HABITABLE',
                                                      'GRAVE / PARCIAL', 'TOTAL / INHABITABLE')),

  contacto_nombre         text,
  contacto_telefono       text,

  lat                     double precision not null check (lat between -90 and 90),
  lng                     double precision not null check (lng between -180 and 180),
  plus_code               text,

  foto_url                text,  -- enlace heredado de Google Drive
  foto_path               text,  -- ruta en Supabase Storage (bucket fotos-viviendas)

  adultos                 integer not null default 0 check (adultos >= 0),
  adultos_mayores         integer not null default 0 check (adultos_mayores >= 0),
  menores                 integer not null default 0 check (menores >= 0),
  total_personas          integer generated always as (adultos + adultos_mayores + menores) stored,
  discapacitados          integer not null default 0 check (discapacitados >= 0),
  casos_medicos           integer not null default 0 check (casos_medicos >= 0),
  condiciones_medicas     text[] not null default '{}',
  perros                  integer not null default 0 check (perros >= 0),
  gatos                   integer not null default 0 check (gatos >= 0),

  nec_agua                boolean not null default false,
  nec_kit_alimento        boolean not null default false,
  nec_kit_higiene         boolean not null default false,
  nec_lona                boolean not null default false,
  nec_camping             boolean not null default false,
  nec_toldas              boolean not null default false,
  nec_colchonetas         boolean not null default false,
  nec_otros               text[] not null default '{}',

  ent_agua                boolean not null default false,
  ent_kit_alimento        boolean not null default false,
  ent_kit_higiene         boolean not null default false,
  ent_lona                boolean not null default false,
  ent_camping             boolean not null default false,
  ent_toldas              boolean not null default false,
  ent_colchonetas         boolean not null default false,
  ent_otros               text[] not null default '{}',
  observaciones_atencion  text,

  -- Un reporte ATENDIDO siempre tiene fecha de atención y uno PENDIENTE nunca.
  constraint reportes_atencion_coherente
    check ((estado = 'ATENDIDO') = (attended_at is not null))
);

create index reportes_estado_idx     on public.reportes (estado);
create index reportes_club_idx       on public.reportes (club_id);
create index reportes_updated_at_idx on public.reportes (updated_at desc);
create index profiles_club_idx       on public.profiles (club_id);

-- ---------------------------------------------------------------------
-- 2. Funciones de apoyo para los permisos
-- ---------------------------------------------------------------------

create or replace function public.is_active_member()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.activo
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.activo and p.rol = 'admin'
  );
$$;

-- ---------------------------------------------------------------------
-- 3. Triggers
-- ---------------------------------------------------------------------

-- 3.1 Crear el perfil automáticamente al crear un usuario en Auth.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, nombre_completo)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nombre_completo',
             new.raw_user_meta_data ->> 'full_name',
             split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3.2 Un miembro solo puede cambiar su nombre; rol, club y activo los cambia un admin.
--     (Desde el SQL Editor no hay sesión, auth.uid() es null y se permite todo.)
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
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_protect_fields
  before update on public.profiles
  for each row execute function public.protect_profile_fields();

-- 3.3 Auditoría de reportes: quién creó / modificó y cuándo.
create or replace function public.set_reporte_audit()
returns trigger
language plpgsql set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if tg_op = 'INSERT' then
    if uid is not null then
      new.created_by := uid;
      new.updated_by := uid;
    end if;
  else
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    new.updated_by := coalesce(uid, new.updated_by);
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create trigger reportes_audit
  before insert or update on public.reportes
  for each row execute function public.set_reporte_audit();

-- ---------------------------------------------------------------------
-- 4. Permisos (Row Level Security)
-- ---------------------------------------------------------------------

alter table public.clubs    enable row level security;
alter table public.profiles enable row level security;
alter table public.reportes enable row level security;

-- Nadie sin sesión (rol anon) puede leer ni escribir nada.
revoke all on public.clubs, public.profiles, public.reportes from anon;
grant select, insert, update, delete on public.clubs    to authenticated;
grant select, update                 on public.profiles to authenticated;
grant select, insert, update, delete on public.reportes to authenticated;

-- clubs
create policy "clubs: miembros leen" on public.clubs
  for select to authenticated using (public.is_active_member());
create policy "clubs: admin crea" on public.clubs
  for insert to authenticated with check (public.is_admin());
create policy "clubs: admin edita" on public.clubs
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "clubs: admin borra" on public.clubs
  for delete to authenticated using (public.is_admin());

-- profiles
create policy "profiles: miembros leen" on public.profiles
  for select to authenticated using (public.is_active_member() or id = (select auth.uid()));
create policy "profiles: cada uno edita el suyo" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "profiles: admin edita todos" on public.profiles
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- reportes
create policy "reportes: miembros leen" on public.reportes
  for select to authenticated using (public.is_active_member());
create policy "reportes: miembros crean" on public.reportes
  for insert to authenticated with check (public.is_active_member());
create policy "reportes: miembros editan" on public.reportes
  for update to authenticated using (public.is_active_member()) with check (public.is_active_member());
create policy "reportes: solo admin borra" on public.reportes
  for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------
-- 5. Storage para las fotos nuevas (privado)
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos-viviendas', 'fotos-viviendas', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "fotos: miembros ven" on storage.objects
  for select to authenticated
  using (bucket_id = 'fotos-viviendas' and public.is_active_member());
create policy "fotos: miembros suben" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'fotos-viviendas' and public.is_active_member());
create policy "fotos: autor reemplaza" on storage.objects
  for update to authenticated
  using (bucket_id = 'fotos-viviendas' and owner_id = (select auth.uid())::text and public.is_active_member());
create policy "fotos: solo admin borra" on storage.objects
  for delete to authenticated
  using (bucket_id = 'fotos-viviendas' and public.is_admin());
