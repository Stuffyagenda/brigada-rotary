/**
 * Lectura centralizada de las variables de entorno públicas de Supabase.
 *
 * Es el ÚNICO archivo que lee `process.env` para Supabase. Next.js sustituye en
 * tiempo de compilación cada `process.env.NEXT_PUBLIC_*` escrito de forma literal,
 * por eso no se accede con claves dinámicas.
 *
 * La validación ocurre al llamar a `getSupabaseEnv()`, no al importar el módulo,
 * para que `next build` funcione aunque falte `.env.local`.
 *
 * Nunca se usa la clave `service_role` en la app.
 */

export interface SupabaseEnv {
  /** URL del proyecto (Project Settings → Data API → Project URL). */
  url: string;
  /** Clave publicable (Project Settings → API Keys → Publishable key). */
  publishableKey: string;
}

function required(name: string, value: string | undefined): string {
  if (!value || value.trim() === "") {
    throw new Error(
      `Falta la variable de entorno ${name}. Defínela en .env.local (desarrollo) o en el panel de Vercel (producción).`,
    );
  }
  return value.trim();
}

/**
 * Devuelve la configuración de Supabase.
 * @throws Error que nombra la variable que falta.
 */
export function getSupabaseEnv(): SupabaseEnv {
  return {
    url: required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    publishableKey: required(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ),
  };
}

/** `true` si ambas variables están definidas (no lanza). */
export function hasSupabaseEnv(): boolean {
  try {
    getSupabaseEnv();
    return true;
  } catch {
    return false;
  }
}
