# Brigada Rotary · Configuración de Supabase

Cómo crear en Supabase la base de datos de Brigada Rotary, con los mismos datos que hoy están en Google Sheets y con un usuario propio para cada miembro (Supabase Auth).

| Archivo | Qué es | ¿Va en git? |
|---|---|---|
| `SUPABASE_SETUP.md` | Esta guía (incluye el schema completo) | Sí |
| `supabase/schema.sql` | El mismo schema, listo para copiar y pegar | Sí |
| `supabase/gen_seed.py` | Script que genera `seed.sql` a partir del Excel (no contiene datos) | Sí |
| `supabase/seed.sql` | Los 55 reportes reales del Excel | **No.** Contiene datos personales y está en `.gitignore` |

---

## 1. Resumen del modelo

```
auth.users ──1:1── profiles ──N:1── clubs
                       │               │
                       │ created_by    │ club_id
                       ▼               ▼
                     reportes ─────────┘
```

- **`clubs`**: clubes participantes, con `tipo` = `rotary` (adultos) o `rotaract` (jóvenes).
- **`profiles`**: un perfil por usuario de Auth. Guarda nombre, club, rol (`admin` / `miembro`) y si está `activo`.
- **`reportes`**: una fila por vivienda o familia visitada. Equivale a la hoja "Reportes".

### Roles

| Acción | `miembro` | `admin` |
|---|:---:|:---:|
| Ver todos los reportes y el mapa | ✅ | ✅ |
| Crear y editar reportes | ✅ | ✅ |
| **Borrar** reportes | ❌ | ✅ |
| Ver clubes y perfiles | ✅ | ✅ |
| Crear o editar clubes | ❌ | ✅ |
| Cambiar su propio nombre | ✅ | ✅ |
| Cambiar rol, club o activo de alguien | ❌ | ✅ |
| Subir fotos | ✅ | ✅ |
| Borrar fotos | ❌ | ✅ |

Un usuario con `activo = false` no ve nada. Sin sesión iniciada no se ve nada.

### Qué hace la base de datos sola
- Al crear un usuario en Auth se crea su fila en `profiles`, con rol `miembro`.
- `total_personas` se calcula sola: adultos + adultos mayores + menores.
- `created_by`, `updated_by` y `updated_at` se rellenan solos con el usuario y la hora.
- No permite un reporte `ATENDIDO` sin fecha de atención, ni uno `PENDIENTE` con fecha.

---

## 2. Qué se encontró en el Excel y cómo se migra

`Brigadarotary (1).xlsx` tiene una hoja **"Reportes"** con **55 filas** y **40 columnas**.

| Hallazgo | Tratamiento |
|---|---|
| Los `ID` son UUID únicos | Se conservan tal cual como `reportes.id` |
| Fechas ISO en UTC | Se convierten a `timestamptz` |
| Conteos guardados como `"5.0"` | Se convierten a `integer` |
| `Sí` / `No` | Se convierten a `true` / `false` |
| Listas como `"Palets, Ropa"` | Se convierten a `text[]` (`{Palets,Ropa}`) |
| 15 teléfonos guardados como número (`6.6…E7`, sin guion) | Se normalizan a `6xxx-xxxx` |
| `Total Personas` = suma exacta en las 55 filas | Columna generada; no se importa |
| La columna `Brigadista` guarda nombres de **clubes** | Se crean 3 clubes Rotaract y se enlaza `club_id`. El texto original queda en `brigadista_texto` |
| 1 fila con un nombre de persona y 12 vacías en `Brigadista` | `club_id = null`; el texto se conserva |
| 20 fotos en Google Drive | Se quedan en `foto_url`. Las fotos nuevas irán a Supabase Storage (`foto_path`) |

**Clubes creados por el seed:**

| Club | Tipo | Provincia |
|---|---|---|
| Club Rotaract Chitre | rotaract | Herrera |
| Club Rotaract de Chitré | rotaract | Herrera |
| Club Rotaract Universitario Aguadulce | rotaract | Coclé |

> "Club Rotaract Chitre" y "Club Rotaract de Chitré" se crean como **dos clubes distintos**, porque así están escritos. Si fueran el mismo, ver [§ 7.3](#73-fusionar-dos-clubes).

---

## 3. Paso a paso

### Paso 1: Cerrar el registro público
**Authentication → Sign In / Providers → Email**
- Desactiva **"Allow new users to sign up"**.
- Deja **"Confirm email"** como prefieras. Al crear usuarios a mano se pueden marcar como confirmados.

Así nadie puede crearse una cuenta por su cuenta. Solo existen los usuarios que tú creas.

### Paso 2: Crear el schema
**SQL Editor → New query** → pega todo el bloque de la [sección 4](#4-schema-sql) (o el contenido de `supabase/schema.sql`) → **Run**.

Debe terminar con `Success. No rows returned`.

### Paso 3: Cargar los datos del Excel
**SQL Editor → New query** → pega el contenido de `supabase/seed.sql` → **Run**.

- Todo va dentro de una transacción: si algo falla, no se guarda nada.
- Se puede ejecutar dos veces sin duplicar (`on conflict do nothing`).

Si cambian los datos en Google Sheets antes de migrar, descarga de nuevo el Excel y regenera el seed:

```bash
python3 -I supabase/gen_seed.py ~/Downloads/"Brigadarotary (1).xlsx" supabase/seed.sql
```

### Paso 4: Crear los usuarios
Para cada miembro: **Authentication → Users → Add user → Create new user**
- Email y contraseña.
- Marca **"Auto Confirm User"**.

El trigger le crea su perfil con rol `miembro`. Después, en el **SQL Editor**, asígnale nombre y club:

```sql
update public.profiles p
set nombre_completo = 'Nombre Apellido',
    club_id = (select id from public.clubs where nombre = 'Club Rotaract Chitre')
from auth.users u
where u.id = p.id and u.email = 'correo@ejemplo.com';
```

### Paso 5: Nombrar al primer admin

```sql
update public.profiles p
set rol = 'admin'
from auth.users u
where u.id = p.id and u.email = 'tu-correo@ejemplo.com';
```

### Paso 6: Verificar
Ver [sección 5](#5-verificación).

### Paso 7: Claves para la app
**Project Settings → API Keys**
- La clave **publishable / anon** y la **URL del proyecto** pueden ir en `index.html`. Los permisos (RLS) protegen los datos.
- La clave **secret / service_role** **nunca** va en el frontend ni en git: se salta todos los permisos.

---

## 4. Schema SQL

```sql
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
```

---

## 5. Verificación

### 5.1 Datos (después del seed)

```sql
select count(*) from public.reportes;                                  -- 55
select count(*) from public.clubs;                                     -- 3
select estado, count(*) from public.reportes group by 1;               -- ATENDIDO 49 · PENDIENTE 6
select prioridad, count(*) from public.reportes group by 1;            -- MEDIA 40 · ALTA 8 · BAJA 7
select danio_vivienda, count(*) from public.reportes group by 1;       -- MENOR 21 · GRAVE 18 · TOTAL 16
select sum(total_personas) from public.reportes;                       -- 399
select count(*) from public.reportes where foto_url is not null;       -- 20
select count(*) from public.reportes where contacto_telefono like '%E%'; -- 0

select c.nombre, count(r.id)
from public.clubs c left join public.reportes r on r.club_id = c.id
group by 1 order by 2 desc;   -- Chitre 24 · de Chitré 11 · Aguadulce 7  (13 reportes sin club)
```

### 5.2 Permisos (RLS)
Reemplaza los UUID por los de tus usuarios (los ves en **Authentication → Users**). Todo va dentro de `rollback`, así que no cambia nada.

```sql
-- Como MIEMBRO: ve todo, pero no puede borrar
begin;
select set_config('request.jwt.claims', '{"sub":"UUID-DEL-MIEMBRO","role":"authenticated"}', true);
set local role authenticated;
select count(*) from public.reportes;   -- 55
delete from public.reportes;            -- DELETE 0  (no borra nada)
update public.profiles set rol = 'admin' where id = 'UUID-DEL-MIEMBRO';  -- ERROR: Solo un administrador…
rollback;

-- Como ADMIN: sí puede borrar
begin;
select set_config('request.jwt.claims', '{"sub":"UUID-DEL-ADMIN","role":"authenticated"}', true);
set local role authenticated;
delete from public.reportes;            -- DELETE 55
rollback;                               -- ← deshace el borrado

-- Sin sesión (anon): sin acceso
begin;
set local role anon;
select count(*) from public.reportes;   -- ERROR: permission denied (esperado)
rollback;
```

---

## 6. Equivalencias Excel → Supabase

Para reescribir `index.html` y para futuras exportaciones.

| Columna en el Excel | Campo actual en la app | Columna en `reportes` | Tipo |
|---|---|---|---|
| ID | `id` | `id` | uuid |
| Fecha Creacion | `createdAt` | `created_at` | timestamptz |
| Fecha Atendido | `attendedAt` | `attended_at` | timestamptz |
| Fecha Ultima Modificacion | `updatedAt` | `updated_at` | timestamptz |
| Brigadista | `brigadista` | `brigadista_texto` (+ `club_id`) | text |
| Estado | `status` | `estado` | text |
| Prioridad | `priority` | `prioridad` | text |
| Contacto Nombre | `contactName` | `contacto_nombre` | text |
| Contacto Telefono | `contactPhone` | `contacto_telefono` | text |
| Latitud / Longitud | `lat` / `lng` | `lat` / `lng` | double precision |
| Plus Code | `plusCode` | `plus_code` | text |
| Danio Vivienda | `houseDamage` | `danio_vivienda` | text |
| Foto Vivienda URL | `photoUrl` | `foto_url` (nuevas: `foto_path`) | text |
| Total Personas | `totalPeople` | `total_personas` (generada) | integer |
| Adultos | `adultsCount` | `adultos` | integer |
| Adultos Mayores | `seniorsCount` | `adultos_mayores` | integer |
| Menores | `minorsCount` | `menores` | integer |
| Discapacitados | `disabledCount` | `discapacitados` | integer |
| Casos Medicos | `medicalCasesCount` | `casos_medicos` | integer |
| Condiciones Medicas | `medicalConditions` | `condiciones_medicas` | text[] |
| Perros / Gatos | `dogsCount` / `catsCount` | `perros` / `gatos` | integer |
| Nec Agua … Nec Colchonetas | `necWater` … `necColchonetas` | `nec_agua` … `nec_colchonetas` | boolean |
| Nec Otros Insumos | `necOtherSupplies` | `nec_otros` | text[] |
| Ent Agua … Ent Colchonetas | `entWater` … `entColchonetas` | `ent_agua` … `ent_colchonetas` | boolean |
| Ent Otros Insumos | `entOtherSupplies` | `ent_otros` | text[] |
| Observaciones Atencion | `attendedNotes` | `observaciones_atencion` | text |

Columnas nuevas, que no existían en el Excel: `club_id`, `created_by`, `updated_by` y `foto_path`.

---

## 7. Tareas frecuentes

### 7.1 Añadir un club (por ejemplo, un Club Rotario de adultos)
```sql
insert into public.clubs (nombre, tipo, provincia)
values ('Club Rotario de Chitré', 'rotary', 'Herrera');
```

### 7.2 Desactivar a un miembro (deja de ver los datos al instante)
```sql
update public.profiles p set activo = false
from auth.users u where u.id = p.id and u.email = 'correo@ejemplo.com';
```
Para bloquear también el inicio de sesión: **Authentication → Users → … → Ban user** (o eliminarlo).

### 7.3 Fusionar dos clubes
Solo si "Club Rotaract Chitre" y "Club Rotaract de Chitré" resultan ser el mismo:
```sql
begin;
update public.reportes set club_id = (select id from public.clubs where nombre = 'Club Rotaract de Chitré')
where club_id = (select id from public.clubs where nombre = 'Club Rotaract Chitre');
update public.profiles set club_id = (select id from public.clubs where nombre = 'Club Rotaract de Chitré')
where club_id = (select id from public.clubs where nombre = 'Club Rotaract Chitre');
delete from public.clubs where nombre = 'Club Rotaract Chitre';
commit;
```

### 7.4 Ver la lista de miembros
```sql
select u.email, p.nombre_completo, c.nombre as club, p.rol, p.activo
from public.profiles p
join auth.users u on u.id = p.id
left join public.clubs c on c.id = p.club_id
order by c.nombre, p.nombre_completo;
```

---

## 8. Pendiente para después
- **Reescribir `index.html` con `supabase-js`:**
  - inicio de sesión con email y contraseña (`signInWithPassword`) en lugar de la contraseña compartida;
  - lectura y escritura en `reportes` en lugar de `WEBHOOK_URL`;
  - fotos con `storage.from('fotos-viviendas').upload(...)`, guardando la ruta en `foto_path`.
- **Adaptar la sincronización offline** (`triggerSync`, `fetchGlobalReports`): usar `upsert` por `id`. Al ser el UUID generado en el celular, el modo sin conexión sigue funcionando.
- **Opcional: migrar las 20 fotos de Drive a Storage.** Descargarlas, subirlas al bucket y rellenar `foto_path`.
- **Apagar el Apps Script y retirar el acceso a la hoja** cuando todo esté en Supabase.
