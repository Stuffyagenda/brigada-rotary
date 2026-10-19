# Brigada Rotary

Aplicación web progresiva (PWA) para registrar y coordinar la atención a familias afectadas en campo: mapa de reportes, ficha por vivienda y formulario de censo, necesidades y entregas. Funciona sin conexión: los datos se guardan en el dispositivo (IndexedDB) y se sincronizan con Supabase cuando vuelve la señal.

## Stack

| Área | Tecnología |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack), React 19, TypeScript estricto |
| Estilos | Tailwind CSS v4 (tokens en `app/globals.css`, `@theme`) |
| Auth, datos y archivos | Supabase (`@supabase/supabase-js`, `@supabase/ssr`): Postgres con RLS, Auth y Storage |
| Datos locales | Dexie (IndexedDB) + `dexie-react-hooks` |
| Service worker | Serwist (`@serwist/next`, modo configurador + `@serwist/cli`) |
| Mapa | Leaflet + React Leaflet (OpenStreetMap y Esri) |
| Formularios | React Hook Form + Zod |
| UI | Vaul (panel inferior), Sonner (avisos), Radix Alert Dialog, Lucide (iconos) |
| Tests | Vitest + Testing Library + fake-indexeddb; Playwright (e2e) |

## Requisitos

- Node.js ≥ 20.9 (recomendado 24 LTS) y npm.
- Un proyecto de Supabase.

## Variables de entorno

Crear `.env.local` en la raíz (no se versiona):

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

| Variable | Dónde se obtiene en Supabase | Uso |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project Settings → Data API → Project URL | URL base de la API (Auth, PostgREST, Storage, Realtime) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Project Settings → API Keys → Publishable key | Clave pública del cliente; los permisos reales los aplica la RLS |

- Solo `lib/env.ts` lee estas variables. Si falta alguna, lanza un error que nombra la variable.
- La app nunca usa la clave `service_role`.
- `next build` funciona sin `.env.local`: la validación ocurre al crear el cliente de Supabase, no al importar.

## Base de datos

1. En el SQL Editor de Supabase, ejecutar `supabase/schema.sql` (tablas `clubs`, `profiles`, `reportes`; funciones `is_admin()` e `is_active_member()`; triggers; RLS; bucket privado `fotos-viviendas`).
2. Ejecutar, en orden, cada archivo de `supabase/migrations/*.sql`:

   | Migración | Contenido |
   |---|---|
   | `002_realtime.sql` | Publica `public.reportes` en `supabase_realtime` |
   | `003_registro_fecha_visitas.sql` | Registro abierto, `reportes.fecha_reporte` y tabla `visitas` (detalle abajo). Idempotente: se puede volver a ejecutar |

   La 003 debe estar aplicada **antes** de desplegar la versión de la app que la usa: el cliente envía `fecha_reporte` en cada upsert y PostgREST rechaza columnas desconocidas (`PGRST204`).
3. Usuarios: con el registro abierto (ver más abajo) cada persona crea su cuenta en `/registro`. También se pueden crear en Authentication → Users. El trigger `on_auth_user_created` crea su perfil con rol `miembro` y activo; el rol `admin`, el club y el estado activo se cambian desde la página de miembros o por SQL.
4. Regenerar los tipos cuando cambie el esquema:

   ```bash
   npx supabase gen types typescript --project-id <id> > lib/database.types.ts
   ```

   `lib/database.types.ts` es generado; los tipos de dominio (uniones literales de los `check`, etiquetas, esquema Zod) están en `lib/types.ts`.

### Migración 003: registro, fecha del reporte y visitas

- **`profiles.nombre`, `profiles.apellido`.** En los perfiles existentes `nombre` toma el `nombre_completo` (no se parte el apellido; `apellido` queda null).
- **`handle_new_user()`** lee `raw_user_meta_data` (`nombre`, `apellido`, `club_id`), que la app envía en `signUp({ options: { data } })`:
  - `club_id` solo se guarda si es un uuid válido y existe en `clubs`; si no, null (un club inventado nunca hace fallar el alta por la FK);
  - `nombre_completo = trim(nombre || ' ' || apellido)`; si faltan, `nombre_completo`, `full_name` o la parte local del correo;
  - textos recortados (máx. 120 caracteres); rol siempre `miembro` y `activo = true` (registro abierto sin aprobación; el admin desactiva en `/miembros`). Rol y activo nunca se leen de los metadatos.
- **`protect_profile_fields()`**: el miembro puede cambiar `nombre`, `apellido` y `nombre_completo`, no rol, club ni activo. Si cambia nombre o apellido sin enviar otro `nombre_completo`, este se recalcula. `created_at` no cambia.
- **`clubs_publicos()`** (`security definer`, `stable`): devuelve `id, nombre, tipo` de todos los clubes ordenados por nombre; ejecutable por `anon` y `authenticated` (`supabase.rpc('clubs_publicos')`). La tabla `clubs` sigue cerrada para `anon`.
- **`reportes.fecha_reporte date not null`**: fecha del reporte elegida por el brigadista. Backfill: `(created_at at time zone 'America/Panama')::date` (con el trigger de auditoría desactivado durante el relleno, para no tocar `updated_at`). Default: la fecha de hoy en Panamá (`(now() at time zone 'America/Panama')::date`; el servidor está en UTC). Check `reportes_fecha_no_futura`: `fecha_reporte <= hoy en Panamá + 1` (un día de tolerancia por los relojes; la app valida "no futura" contra hoy).
- **Tabla `visitas`**: entregas posteriores a una familia ya registrada (historial de la ficha).

  | Columna | Tipo |
  |---|---|
  | `id` | uuid pk (lo genera el celular) |
  | `reporte_id` | uuid not null → `reportes(id)` **on delete cascade** |
  | `fecha` | date not null, default hoy en Panamá, check no futura (igual que `fecha_reporte`) |
  | `visitado_at` | timestamptz not null default now() |
  | `brigadista_texto`, `observaciones` | text |
  | `ent_agua` … `ent_colchonetas` | boolean not null default false (7) |
  | `ent_otros` | text[] not null default '{}' |
  | `created_at` | timestamptz not null default now() |
  | `created_by` | uuid → `profiles(id)` on delete set null; lo fija el trigger `set_visita_audit` con `auth.uid()` (en un update se conservan autor y `created_at`) |

  Índice `(reporte_id, fecha desc)`. RLS: leer, crear y editar para miembros activos; borrar solo admin. Sin acceso para `anon`. Publicada en `supabase_realtime`.

### Registro abierto (Auth)

- En Authentication → Sign In / Providers, activar **Allow new users to sign up**; sin esa opción `signUp` falla y solo se pueden crear usuarios desde el dashboard.
- **Confirm email** (Authentication → Sign In / Providers → Email):
  - activado: `signUp` no devuelve sesión; el usuario recibe un correo de confirmación y luego inicia sesión. El perfil se crea igualmente al registrarse (el trigger corre al insertar en `auth.users`);
  - desactivado: `signUp` devuelve la sesión y la app entra directamente.
- Con "Confirm email" activado, añadir el dominio de la app a Site URL / Redirect URLs (Authentication → URL Configuration) para que el enlace del correo vuelva a la app.

## Scripts

| Script | Descripción |
|---|---|
| `npm run dev` | Servidor de desarrollo (Turbopack) en `http://localhost:3000` |
| `npm run build` | Build de producción (`next build`) y service worker (`serwist build` → `public/sw.js`) |
| `npm run build:sw` | Solo regenera el service worker a partir de `app/sw.ts` (requiere un `next build` previo) |
| `npm run start` | Sirve el build de producción |
| `npm run lint` | ESLint |
| `npm run typecheck` | Genera los tipos de rutas y ejecuta `tsc --noEmit` (app y, aparte, el service worker con `tsconfig.sw.json`) |
| `npm test` | Tests unitarios (Vitest) |
| `npm run test:watch` | Vitest en modo observador |
| `npm run test:e2e` | Tests end-to-end (Playwright) |

## Estructura

```
app/
  layout.tsx            Layout raíz: fuentes, metadatos, avisos (Sonner)
  globals.css           Tokens de diseño y estilos base
  manifest.ts           Manifest de la PWA (/manifest.webmanifest)
  sw.ts                 Fuente del service worker (Serwist)
  (auth)/login/         Inicio de sesión
  (app)/                Rutas con sesión: mapa (/), registros, miembros
components/
  ui/                   Primitivas: Button, YesNo, Counter, Chip, HoldToDelete
  map/ sheet/ form/     Mapa, ficha de triaje y panel, formulario de reporte
  sync/                 SyncProvider (arranca el motor) y SyncIndicator
  pwa/                  Registro del service worker e InstallButton
hooks/
  useReportes.ts        Lectura reactiva de reportes locales y filtros (incluida la vigencia)
  useVisitas.ts         Visitas locales de un reporte (historial), de la más reciente a la más antigua
  useAhora.ts           Hora actual renovada cada 10 min y al volver a la app (recalcula la vigencia)
lib/
  env.ts                Variables de entorno (único punto de lectura)
  supabase/             Clientes de Supabase (navegador y servidor)
  database.types.ts     Tipos generados de la base
  types.ts              Tipos de dominio, etiquetas y esquema Zod
  db.ts                 Base local Dexie: reportes, visitas, outbox, meta
  vigencia.ts           Fechas en hora de Panamá y vigencia de la atención
  sync/                 Motor de sincronización (saveReport, saveVisita, deleteReport, syncNow, useSyncState)
  auth/profile.tsx      Perfil, club y rol del usuario (ProfileProvider, useProfile)
  pluscode.ts           Plus Codes (Open Location Code)
  places.ts geocode.ts  Búsqueda de lugares: Plus Code, comunidades locales, Nominatim
  compress-image.ts     Compresión de fotos (1200 px, JPEG 0.72)
  report-rules.ts       Reglas del formulario y de guardado
  report-diff.ts        Mensaje de confirmación según los cambios
  brigadista.ts         Último brigadista escrito (valor inicial de reportes nuevos)
public/icons/           Iconos de la PWA
supabase/               Esquema SQL y migraciones
e2e/                    Tests Playwright
```

## Pantallas

| Ruta | Contenido |
|---|---|
| `/` | Mapa (Leaflet, capas Calles y Satélite) con buscador de comunidad o Plus Code, Mi ubicación, Elegir en el mapa, filtros (estado, prioridad, necesidad, club) y panel: resumen de la zona, ficha de triaje o formulario. En móvil el panel es un Vaul con tres posiciones; desde 1024 px, una columna fija de 420 px |
| `/registros` | Reportes guardados en el celular, con búsqueda local (contacto, teléfono, brigadista, estado, Plus Code o id), estado de sincronización, "Ver en mapa" y "Editar" |
| `/miembros` | Solo admin activo (enlace en el menú de cuenta): lista de miembros con su club, rol y acceso activo/desactivado. Un admin no puede quitarse el rol ni desactivarse a sí mismo |

Estado del mapa en la URL (se actualiza con `history.pushState`/`replaceState`, sin pedir nada al servidor):

| Parámetro | Efecto |
|---|---|
| `reporte=<id>` | Abre la ficha del reporte |
| `reporte=nuevo` | Abre el formulario de un reporte nuevo |
| `reporte=<id>&editar=1` | Abre el formulario de edición |
| `estado`, `prioridad`, `necesidad`, `club` | Filtros, con valores separados por comas (`estado=PENDIENTE&necesidad=agua,otros`) |

El buscador del mapa solo resuelve Plus Codes y comunidades (`lib/geocode.ts`); los nombres y teléfonos se buscan únicamente en `/registros`, sin salir del celular. Como el último paso del buscador es Nominatim (servicio externo), `geocode()` no lo consulta si el término parece un dato personal: 6 o más dígitos (teléfono), un `@` (correo) o el nombre de un contacto de los reportes locales (opción `excluir`).

La búsqueda de `/registros` (`components/registros/buscar.ts` sobre `filtrarReportes`) mira contacto, teléfono (también sin guiones), brigadista, estado ("Pendiente", "Atendido"), Plus Code (el guardado o, si falta, el calculado de `lat`/`lng`) e id, sin distinguir mayúsculas ni tildes.

## Fechas y vigencia de la atención

`lib/vigencia.ts`. Las fechas de calendario (`fecha_reporte`, `visitas.fecha`) son texto `YYYY-MM-DD` y se cuentan siempre en America/Panama (UTC−5, sin horario de verano), sin importar la zona del celular: `hoyPanama(ahora?)`, `fechaPanama(iso)`, `formatearFechaLarga(fecha)` ("18 de octubre de 2026").

| Vigencia | Condición | Token |
|---|---|---|
| `pendiente` | estado PENDIENTE | `pending` |
| `reciente` | ATENDIDO hace 0–3 días | `done` |
| `por-vencer` | ATENDIDO hace 4–6 días | `aging` (`#B45309`) |
| `vencido` | ATENDIDO hace 7 días o más | `stale` (`#000000`) |

- Los días son de calendario en Panamá entre `attended_at` y hoy (`diasDesdeAtencion`). Una visita nueva actualiza `attended_at` del reporte, así que la vigencia cuenta desde la última visita.
- `filtrarReportes(reportes, { vigencia: [...] }, ahora)` filtra por vigencia; `useReportes(filtros, ahora)` recibe la hora de `useAhora()` para recalcularla al pasar el tiempo.
- Un ATENDIDO sin `attended_at` (lo impide el check del SQL) cuenta como `vencido`.

## Visitas (datos locales y sync)

- Dexie v2 (`lib/db.ts`): tabla `visitas` (`id, reporte_id, fecha, _sync`) con `VisitaLocal = Visita & { _sync }`. La migración local desde la v1 rellena `fecha_reporte` (fecha de `created_at` en Panamá) en los reportes y en los upsert pendientes de la cola.
- `saveVisita(input)` valida con `visitaSchema` (fecha no futura; al menos una entrega u observación), guarda la visita como `pending` y, en la misma transacción, actualiza el reporte por la ruta de `saveReport`: `estado = 'ATENDIDO'`, `attended_at = visitado_at` (la fecha de la visita con la hora actual de Panamá), `ent_*`/`ent_otros`/`observaciones_atencion` de la visita. Una visita con fecha anterior a la última atención entra al historial sin retroceder el reporte.
- Cola: las entradas del `outbox` tienen `entidad` (`"reporte"` | `"visita"`; ausente = reporte, entradas de la v1). Las de visita llevan `reporteId` (de su reporte), `visitaId` y `visitaPayload`. El envío de visitas y su pull/Realtime están pendientes: hoy `pushOutbox` deja intactas las entradas de visita (`TODO(sync-visitas)` en `lib/sync`).
- `deleteReport` borra también las visitas locales del reporte; `limpiarEspejoLocal` borra las visitas sincronizadas.

## Roles y permisos

Los permisos se aplican en Postgres con Row Level Security; la UI solo oculta lo que el usuario no puede hacer.

| Acción | Miembro activo | Admin activo | Miembro inactivo / sin sesión |
|---|---|---|---|
| Leer reportes, clubes y perfiles de otros | Sí | Sí | No |
| Leer su propio perfil | Sí | Sí | Inactivo: sí (para ver que está desactivado). Sin sesión: no |
| Crear y editar reportes | Sí | Sí | No |
| Borrar reportes | No | Sí | No |
| Ver y subir fotos (`fotos-viviendas`) | Sí | Sí | No |
| Reemplazar una foto | Solo las propias | Solo las propias | No |
| Borrar fotos | No | Sí | No |
| Leer, crear y editar visitas | Sí | Sí | No |
| Borrar visitas | No | Sí | No |
| Editar su nombre y apellido | Sí | Sí | — |
| Cambiar rol, club o estado activo | No | Sí | No |
| Crear, editar y borrar clubes | No | Sí | No |

- `is_active_member()` e `is_admin()` (security definer) leen el perfil del usuario actual.
- El trigger `set_reporte_audit` rellena `created_by`, `updated_by` y `updated_at`; `total_personas` es una columna generada.
- Sin sesión (`anon`) solo se puede ejecutar `clubs_publicos()` (lista de clubes para el registro).
- En `/miembros` (solo admin activo) se cambian club, rol y acceso. Un admin no puede quitarse el rol ni desactivarse a sí mismo desde la app.

## Autenticación

- **Login:** `/login` con correo y contraseña (`signInWithPassword`). Sin magic link. Registro abierto en `/registro` (ver "Registro abierto (Auth)"). Tras entrar vuelve a `?next=` si es una ruta interna (`lib/auth/redirect.ts`).
- **Proxy (`proxy.ts`, Next 16):** refresca la sesión de `@supabase/ssr` en las cookies y redirige a `/login` las navegaciones `GET` sin sesión. Excluye `_next`, `/icons`, `/sw.js`, el manifiesto y los archivos con extensión. Si Supabase no responde, deja pasar.
- **Guard del cliente (`components/auth/SessionGate.tsx`, layout `(app)`):** comprobación definitiva. Sin sesión → `/login`; perfil con `activo = false` → pantalla de acceso desactivado con "Cerrar sesión".
- **Offline:** `ProfileProvider` (`lib/auth/profile.tsx`) lee la sesión local con `auth.getSession()` y guarda el perfil y su club en Dexie (`meta`, clave `perfil`). Si no hay señal y la sesión guardada no se puede refrescar, usa la caché (`offline: true`) y deja pasar; solo trata como "sin sesión" cuando no hay sesión local. Cerrar sesión borra la caché del perfil y, con `limpiarEspejoLocal()` (`lib/sync`), la copia local de los reportes ya sincronizados (`_sync: 'synced'` sin entradas en la cola), para no dejar datos personales de las familias en un celular compartido; también olvida el último brigadista escrito y la fecha del último sync. Nunca borra la cola (`outbox`) ni los reportes pendientes o con error: se envían cuando alguien vuelve a iniciar sesión. Al volver a entrar, el pull descarga de nuevo los reportes.

## Funcionamiento offline y sincronización

Código en `lib/sync/` (API pública en `lib/sync/index.ts`). El motor arranca con `startSyncEngine()`, que llama `components/sync/SyncProvider.tsx` al montarse en el layout `(app)`.

- **Lectura:** la UI lee siempre de IndexedDB (`lib/db.ts`) con `useLiveQuery`, nunca directamente de Supabase.
- **Escritura:** `saveReport(input, foto)` valida con Zod, guarda el reporte local con `_sync: 'pending'` y añade un `upsert` al `outbox`.
  - Los IDs son UUID generados en el dispositivo (`lib/sync/uuid.ts`, con respaldo para contextos sin `crypto.randomUUID`, como `http://` en la red local), así que el `upsert` por `id` es idempotente.
  - Con foto nueva, la ruta en Storage (`{reporteId}/{uuid}.jpg`) se fija en `foto_path` al guardar, y los guardados posteriores la heredan. La foto comprimida viaja como `Blob` en la entrada del `outbox`.
  - **Colapso:** si el reporte ya tenía un `upsert` pendiente, se reemplaza en su sitio de la cola. Si no llega foto nueva, se conserva la pendiente.
  - Con señal, intenta enviarlo enseguida (hasta 8 s) y devuelve `synced` solo si el servidor confirmó la fila; si no, `pending`.
  - **Brigadista recordado** (`lib/brigadista.ts`): si al guardar el brigadista escrito es distinto del nombre del perfil, se guarda en `meta` (`ultimoBrigadista`) y es el valor inicial de los reportes nuevos (prioridad: último escrito > nombre del perfil). Escribir de nuevo el nombre del perfil lo olvida; al editar un reporte solo cuenta si se cambió el campo.
- **Envío (push),** por cada entrada del `outbox` en orden:
  1. Sube la foto a `fotos-viviendas/<foto_path>` con `upsert: false` (si el archivo ya existe por un reintento, cuenta como subido) y quita el `Blob` de la entrada.
  2. `upsert(..., { onConflict: 'id' }).select().single()`. No se envían `total_personas`, `created_by`, `updated_by` ni `updated_at`: en el INSERT `updated_at` toma el `default now()` y en el UPDATE lo fija el trigger `set_reporte_audit` (no depende del reloj del celular). `created_at` sí se envía (hora real del registro en campo, aunque se sincronice horas después); en un UPDATE el trigger conserva el original.
  3. Con la fila devuelta, el reporte local pasa a `synced` y la entrada sale de la cola. Si el reporte se editó durante el envío, la entrada se conserva y se envía en la pasada siguiente.
- **Errores** (`clasificarError` en `lib/sync/errors.ts`). `postgrest-js` devuelve el status HTTP en la respuesta (`{ data, error, status }`), no dentro de `error`; el motor lo añade al error (`conStatus`) antes de clasificarlo, y además clasifica por el código SQLSTATE/PostgREST:

  | Tipo | Ejemplos | Qué pasa |
  |---|---|---|
  | Red | sin señal, `TypeError` de `fetch`, status 0, tiempo agotado, 5xx, 408, 429 | El reporte sigue `pending`. Suben `intentos` y `lastError`, y se reintenta solo con backoff (5 s, 10 s… hasta 5 min). La pasada se corta |
  | Rechazo | SQLSTATE de clase 22, 23 o 42 (p. ej. RLS `42501`, check `23514`, FK `23503`), `PGRST1xx`/`PGRST2xx`, otros 4xx | El reporte queda `_sync: 'error'` y la entrada no se reintenta sola. La pasada sigue con la siguiente entrada y hace el pull. Se reintenta con "Sincronizar ahora" o al volver a guardar |
  | Sesión | sin sesión, JWT vencido (401, `PGRST30x`, "JWT expired") | No se borra nada: la cola se conserva y `lastError` pide iniciar sesión |

- **Descarga (pull):** después de un push sin cortes, se hace un `select('*')` paginado de `reportes` y se reconcilia:
  - lo pendiente local gana: un reporte con entradas en la cola no se pisa;
  - un reporte `synced` local más nuevo (`updated_at`) que el descargado no retrocede (p. ej. si llegó por Realtime durante la descarga);
  - se borran del dispositivo los reportes `synced` que ya no existen en el servidor;
  - nunca se borran reportes pendientes ni con error.
- **Realtime:** con señal y sesión, hay una suscripción `postgres_changes` a `public.reportes` (requiere `supabase/migrations/002_realtime.sql`). INSERT, UPDATE y DELETE se aplican a Dexie con las mismas reglas. La suscripción se cancela al perder la señal o la sesión.
- **Disparadores:**
  - al guardar;
  - en el evento `online`;
  - al volver a la pestaña (`visibilitychange`);
  - cada 60 s con señal;
  - con el botón "Sincronizar ahora" (`syncNow()`).

  Las pasadas van en una cola (`lib/sync/engine.ts`): nunca hay dos a la vez y una llamada durante una pasada programa una sola pasada más. `ejecutarExclusivo(fn)` encola una operación que corre después de la pasada en curso (y de la ya programada) y antes de cualquier pasada pedida mientras tanto.
- **Borrado:** `deleteReport(id)` requiere señal (no se encola) y se ejecuta en exclusiva en esa cola: retira del `outbox` las entradas del reporte (así ningún `upsert` pendiente lo "resucita" después del DELETE), ejecuta `delete().eq('id', id).select()` y, si falla, devuelve las entradas a la cola.
  - Si no borra ninguna fila, la RLS lo impidió: "solo un administrador puede hacerlo".
  - Si el reporte solo existía en el dispositivo, se descarta localmente.
  - También se intenta borrar la foto de Storage.
- **Fotos:** `getFotoUrl(reporte)` devuelve, por orden:
  1. la URL `blob:` de la foto pendiente;
  2. una URL firmada de 1 h del bucket privado (en caché de memoria);
  3. la `foto_url` heredada.
- **Estado:** `useSyncState()` expone `online`, `syncing`, `pendientes` (entradas del `outbox`), `lastError` y `lastSyncAt` (guardado en `meta`). Lo muestra `components/sync/SyncIndicator.tsx`.

## Service worker

- Serwist en modo configurador: fuente `app/sw.ts`, configuración `serwist.config.mjs`, salida `public/sw.js` (archivo generado, no versionado). `npm run build` lo genera después de `next build`.
- `app/sw.ts` tiene su propio `tsconfig.sw.json` (lib `webworker`). El `tsconfig.json` principal lo excluye para no mezclar los tipos de `dom` y `webworker`.
- `components/pwa/ServiceWorkerRegister.tsx` lo registra con scope `/`, solo en producción. `next.config.ts` sirve `/sw.js` con `Cache-Control: no-cache` y `Service-Worker-Allowed: /`.
- Estrategias:

  | Petición | Estrategia |
  |---|---|
  | App shell (`/_next/static/**`, fuentes de `next/font`, `public/**`) | Precache (`self.__SW_MANIFEST`) |
  | Navegaciones del mismo origen | NetworkFirst (5 s) en la caché `brigada-paginas`. Sin red ni copia, se sirve la portada `/` guardada o un aviso de "Sin conexión" |
  | JS, CSS y fuentes del mismo origen | CacheFirst (`brigada-estaticos`) |
  | Imágenes del mismo origen | CacheFirst (`brigada-imagenes`) |
  | Supabase (`*.supabase.co`), teselas de OpenStreetMap y Esri, Nominatim y cualquier otro origen | No se interceptan ni se guardan |

- El HTML prerenderado no se precachea (`precachePrerendered: false`), porque las páginas dependen de la sesión: se guardan al visitarlas.
- Solo se guardan respuestas `ok` y sin redirección. `/auth/*` y `/api/*` no se cachean.
- Con `skipWaiting` y `clientsClaim`, una versión nueva toma el control en cuanto se instala.
- Las teselas del mapa no se guardan para uso offline porque las condiciones de uso de OpenStreetMap no lo permiten.
- **Instalación:** `components/pwa/InstallButton.tsx`, montado en el menú de cuenta (`components/auth/AccountMenu.tsx`), muestra "Instalar app" cuando el navegador emite `beforeinstallprompt` (Chrome, Android, escritorio). En iPhone y iPad muestra la instrucción de Safari (Compartir → "Añadir a pantalla de inicio"). Si la app ya está instalada (`display-mode: standalone`) no muestra nada.
- **Manifest:** `app/manifest.ts`, servido en `/manifest.webmanifest`.

## Diseño

- Solo tema claro (`color-scheme: light`).
- Tipografía: Atkinson Hyperlegible Next para todo el texto; Barlow Condensed 600 (`font-stamp`) solo para el sello de estado y los conteos grandes. Base de 17 px, escala 1.25.
- Colores (`@theme`): `ink`, `ink-soft`, `paper`, `white`, `rotary`, `rotary-strong`, `gold`, `pending`, `pending-strong`, `pending-tint`, `done`, `done-tint`, `aging`, `aging-tint`, `stale`, `line`, `map-bg`. Contrastes de la vigencia: blanco sobre `aging` 5.02:1, blanco sobre `stale` 21:1, `ink` sobre `aging-tint` 13.82:1 (`aging` sobre `aging-tint` 4.59:1). Las paletas por defecto de Tailwind están desactivadas; no se usan colores escritos a mano en los componentes.
- Movimiento: curvas `--ease-out`, `--ease-in-out`, `--ease-drawer`; duraciones `--duration-fast` (140 ms), `--duration-base` (200 ms), `--duration-slow` (250 ms). Las animaciones de movimiento usan solo `transform`/`scale`/`translate`, `opacity` y `clip-path`; los cambios de estado pueden transicionar colores. Nunca `transition: all`. Con `prefers-reduced-motion` se desactivan las transformaciones y las animaciones CSS; se conservan opacidad y color.
- La variante `hover:` solo aplica en dispositivos con `(hover: hover) and (pointer: fine)`.
- Foco visible (`:focus-visible` en `globals.css`): contorno `gold` de 3 px separado 2 px y anillo `ink` de 2 px (contraste ≥ 3:1 sobre cualquier fondo claro) en todos los elementos interactivos. En el buscador del mapa el anillo rodea la píldora entera mientras se escribe. Los títulos que reciben foco por programa (`tabIndex={-1}`, p. ej. el de la ficha) no lo muestran.
- Panel del móvil: no es modal; Tab entra y sale del panel siguiendo el orden de la página (el FocusScope de Radix no atrapa el foco).

## Deploy en Vercel

1. Importar el repositorio en Vercel (Root Directory: la raíz del repo; framework: Next.js).
2. En Settings → Environment Variables, definir `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` para Production y Preview.
3. En Supabase, Authentication → URL Configuration: añadir el dominio de Vercel a Site URL y Redirect URLs.

## Tests

```bash
npm test                         # unitarios (Vitest, jsdom, IndexedDB en memoria)
npx playwright install chromium  # una sola vez, descarga el navegador
npm run test:e2e                 # end-to-end (levanta build + start)
```

- Los tests unitarios están junto al código (`*.test.ts(x)`).
- Los e2e deben usar un proyecto de Supabase de pruebas (por ejemplo `supabase start` en local) con datos ficticios, nunca datos reales.

### E2E de flujos (`e2e/flujos.spec.ts`)

Cubren: inicio de sesión de miembro y admin; alta sin red (`context.setOffline`) que queda pendiente y se sincroniza al volver la señal; el miembro no ve "Mantén pulsado para borrar" y el admin sí (y borra el reporte de prueba); un miembro desactivado ve el aviso de acceso desactivado. Bloquean las peticiones a otros orígenes (teselas, Nominatim).

Se saltan (`test.skip`, con el motivo) si falta alguna variable o si `NEXT_PUBLIC_SUPABASE_URL` no apunta a `localhost`/`127.0.0.1`, para no ejecutarse nunca contra el proyecto real.

1. Levantar Supabase local (requiere Docker y la CLI): `npx supabase init` (una vez) y `npx supabase start`. Anotar la `API URL` y la `Publishable key` que imprime.
2. En el Studio local (`http://127.0.0.1:54323`), SQL Editor: ejecutar `supabase/schema.sql` y las migraciones de `supabase/migrations/`.
3. En Authentication → Users del Studio local, crear tres usuarios ficticios con contraseña (p. ej. `miembro@e2e.test`, `admin@e2e.test`, `inactivo@e2e.test`). Luego, en el SQL Editor:

   ```sql
   insert into public.clubs (nombre, tipo) values ('Club E2E', 'rotary');
   update public.profiles set club_id = (select id from public.clubs where nombre = 'Club E2E'), nombre_completo = 'Miembro E2E'
     where id = (select id from auth.users where email = 'miembro@e2e.test');
   update public.profiles set rol = 'admin', nombre_completo = 'Admin E2E'
     where id = (select id from auth.users where email = 'admin@e2e.test');
   update public.profiles set activo = false
     where id = (select id from auth.users where email = 'inactivo@e2e.test');
   ```

4. Ejecutar con las variables en el entorno (tienen prioridad sobre `.env.local` en el build que levanta Playwright):

   ```bash
   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key local> \
   E2E_MIEMBRO_EMAIL=miembro@e2e.test E2E_MIEMBRO_PASSWORD=<contraseña> \
   E2E_ADMIN_EMAIL=admin@e2e.test E2E_ADMIN_PASSWORD=<contraseña> \
   E2E_INACTIVO_EMAIL=inactivo@e2e.test E2E_INACTIVO_PASSWORD=<contraseña> \
   npm run test:e2e
   ```

   `E2E_INACTIVO_*` es opcional (sin ellas solo se salta ese caso). Con un servidor ya levantado en `:3000`, Playwright lo reutiliza: debe estar construido con esas mismas variables.
