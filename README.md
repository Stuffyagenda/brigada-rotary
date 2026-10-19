# Brigada Rotary

## Resumen del proyecto

Aplicación web progresiva para coordinar la atención a familias afectadas. Permite ubicar viviendas en un mapa, registrar censos, necesidades, entregas y visitas posteriores. Funciona sin conexión: guarda el trabajo en el dispositivo y lo sincroniza con Supabase al recuperar la señal.

## Stack tecnológico

| Área | Tecnología |
|---|---|
| Aplicación | Next.js 16, React 19, TypeScript |
| Interfaz | Tailwind CSS 4, Leaflet/React Leaflet, Vaul, Sonner |
| Formularios | React Hook Form, Zod |
| Autenticación y datos | Supabase |
| Trabajo sin conexión | Dexie (IndexedDB), Serwist (service worker) |
| Pruebas | Vitest, Testing Library, Playwright |

## Flujo principal

1. La persona se registra con su nombre, correo y club Rotary o Rotaract. Su solicitud queda pendiente hasta que un administrador la apruebe; si la rechaza, se conserva para una posible reconsideración.
2. En `/miembros`, el administrador consulta las solicitudes y verifica correo y club antes de aprobar o rechazar. Solo los perfiles aprobados y activos pueden acceder a los datos de la brigada.
3. El brigadista ubica una vivienda en el mapa, registra a la familia y sus necesidades, y anota las entregas y visitas posteriores. Puede consultar y editar sus reportes en `/registros`.
4. Sin conexión, los reportes y visitas quedan guardados en el dispositivo. La aplicación los sincroniza con Supabase cuando vuelve la señal.

## Configurar el entorno de desarrollo

1. Instala Node.js 20.9 o superior (recomendado: 24 LTS) y las dependencias:

   ```bash
   npm ci
   ```

2. Crea `.env.local` en la raíz con la URL y la clave pública de Supabase:

   ```dotenv
   NEXT_PUBLIC_SUPABASE_URL=https://<tu-proyecto>.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```

3. Inicia la aplicación en `http://localhost:3000`:

   ```bash
   npm run dev
   ```

   Para comprobar cambios: `npm run lint`, `npm run typecheck` y `npm test`.
