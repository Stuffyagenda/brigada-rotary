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
2. Ejecutar, en orden, cada archivo de `supabase/migrations/*.sql`.
3. Crear los usuarios en Authentication → Users. El trigger `on_auth_user_created` crea su perfil con rol `miembro`; el rol `admin`, el club y el estado activo se asignan desde la página de miembros o por SQL.
4. Regenerar los tipos cuando cambie el esquema:

   ```bash
   npx supabase gen types typescript --project-id <id> > lib/database.types.ts
   ```

   `lib/database.types.ts` es generado; los tipos de dominio (uniones literales de los `check`, etiquetas, esquema Zod) están en `lib/types.ts`.

## Scripts

| Script | Descripción |
|---|---|
| `npm run dev` | Servidor de desarrollo (Turbopack) en `http://localhost:3000` |
| `npm run build` | Build de producción |
| `npm run build:sw` | Genera el service worker (`public/sw.js`) con Serwist a partir de `app/sw.ts` |
| `npm run start` | Sirve el build de producción |
| `npm run lint` | ESLint |
| `npm run typecheck` | Genera los tipos de rutas y ejecuta `tsc --noEmit` |
| `npm test` | Tests unitarios (Vitest) |
| `npm run test:watch` | Vitest en modo observador |
| `npm run test:e2e` | Tests end-to-end (Playwright) |

## Estructura

```
app/
  layout.tsx            Layout raíz: fuentes, metadatos, avisos (Sonner)
  globals.css           Tokens de diseño y estilos base
  (auth)/login/         Inicio de sesión
  (app)/                Rutas con sesión: mapa (/), registros, miembros
components/
  ui/                   Primitivas: Button, YesNo, Counter, Chip
  map/ sheet/ form/     Mapa, ficha de triaje y panel, formulario de reporte
hooks/
  useReportes.ts        Lectura reactiva de reportes locales y filtros
lib/
  env.ts                Variables de entorno (único punto de lectura)
  supabase/             Clientes de Supabase (navegador y servidor)
  database.types.ts     Tipos generados de la base
  types.ts              Tipos de dominio, etiquetas y esquema Zod
  db.ts                 Base local Dexie: reportes, outbox, meta
  sync/                 Motor de sincronización (saveReport, deleteReport, syncNow, useSyncState)
  auth/profile.tsx      Perfil, club y rol del usuario (ProfileProvider, useProfile)
  pluscode.ts           Plus Codes (Open Location Code)
  places.ts geocode.ts  Búsqueda de lugares: Plus Code, comunidades locales, Nominatim
  compress-image.ts     Compresión de fotos (1200 px, JPEG 0.72)
  report-rules.ts       Reglas del formulario y de guardado
  report-diff.ts        Mensaje de confirmación según los cambios
public/icons/           Iconos de la PWA
supabase/               Esquema SQL y migraciones
e2e/                    Tests Playwright
```

## Roles y permisos

Los permisos se aplican en Postgres con Row Level Security; la UI solo oculta lo que el usuario no puede hacer.

| Acción | Miembro activo | Admin activo | Miembro inactivo / sin sesión |
|---|---|---|---|
| Leer reportes, clubes y perfiles | Sí | Sí | No |
| Crear y editar reportes | Sí | Sí | No |
| Borrar reportes | No | Sí | No |
| Ver y subir fotos (`fotos-viviendas`) | Sí | Sí | No |
| Reemplazar una foto | Solo las propias | Solo las propias | No |
| Borrar fotos | No | Sí | No |
| Editar su nombre | Sí | Sí | — |
| Cambiar rol, club o estado activo | No | Sí | No |
| Crear, editar y borrar clubes | No | Sí | No |

- `is_active_member()` e `is_admin()` (security definer) leen el perfil del usuario actual.
- El trigger `set_reporte_audit` rellena `created_by`, `updated_by` y `updated_at`; `total_personas` es una columna generada.
- Crear usuarios requiere `service_role`, por eso se hace desde el dashboard de Supabase.

## Funcionamiento offline y sincronización

- **Lectura:** la UI lee siempre de IndexedDB (`lib/db.ts`) con `useLiveQuery`, nunca directamente de Supabase.
- **Escritura:** `saveReport()` valida con Zod, guarda el reporte local con `_sync: 'pending'` y añade una operación al `outbox` (con la foto comprimida, si la hay). Los IDs son UUID generados en el dispositivo, así que el `upsert` por `id` es idempotente.
- **Envío:** _pendiente de documentar (motor de sync)._
- **Reconciliación y Realtime:** _pendiente de documentar._
- **Service worker:** se genera con Serwist en modo configurador (`serwist.config.mjs`, fuente `app/sw.ts`, salida `public/sw.js`). _Estrategias de caché pendientes de documentar._

## Diseño

- Solo tema claro (`color-scheme: light`).
- Tipografía: Atkinson Hyperlegible Next para todo el texto; Barlow Condensed 600 (`font-stamp`) solo para el sello de estado y los conteos grandes. Base de 17 px, escala 1.25.
- Colores (`@theme`): `ink`, `ink-soft`, `paper`, `white`, `rotary`, `rotary-strong`, `gold`, `pending`, `pending-tint`, `done`, `done-tint`, `line`. Las paletas por defecto de Tailwind están desactivadas.
- Movimiento: curvas `--ease-out`, `--ease-in-out`, `--ease-drawer`; duraciones `--duration-fast` (140 ms), `--duration-base` (200 ms), `--duration-slow` (250 ms). Solo se animan `transform`/`scale`/`translate`, `opacity` y `clip-path`; nunca `transition: all`. Con `prefers-reduced-motion` las transformaciones dejan de animarse.
- La variante `hover:` solo aplica en dispositivos con `(hover: hover) and (pointer: fine)`.
- Foco visible con anillo `gold` en todos los elementos interactivos.

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
