/**
 * Datos y reglas de la página de miembros (solo admin).
 * Lee y escribe `profiles` y `clubs` directamente en Supabase: la página
 * necesita conexión. La RLS (`is_admin()`) y el trigger `protect_profile_fields`
 * garantizan los permisos en el servidor.
 */
import { isNetworkError } from "@/lib/auth/errors";
import { nombreCompletoDe } from "@/lib/auth/nombre";
import type { TypedSupabaseClient } from "@/lib/supabase/client";
import { ROL_LABEL, type Club, type Rol } from "@/lib/types";

/** Columnas de `profiles` que muestra la página (el email vive en auth.users y no es accesible). */
export interface Miembro {
  id: string;
  nombre: string | null;
  apellido: string | null;
  /** Lo recalcula el trigger al cambiar nombre o apellido; respaldo para perfiles antiguos. */
  nombre_completo: string | null;
  club_id: string | null;
  rol: Rol;
  activo: boolean;
}

/**
 * Cambio que hace el admin. `nombre` y `apellido` van juntos (diálogo de datos);
 * `nombre_completo` nunca se envía: lo recalcula `protect_profile_fields`.
 */
export type MiembroCambio = Partial<Pick<Miembro, "club_id" | "rol" | "activo" | "nombre" | "apellido">>;

export type ClubOpcion = Pick<Club, "id" | "nombre" | "tipo">;

const COLUMNAS = "id, nombre, apellido, nombre_completo, club_id, rol, activo";

export const MSG_ADMIN_SIN_RED = "Sin conexión. Necesitas internet para administrar miembros.";

type ConNombre = Partial<Pick<Miembro, "nombre" | "apellido" | "nombre_completo">>;

/** "Nombre Apellido" (o el nombre completo de un perfil antiguo), o "Sin nombre". */
export function nombreVisible(m: ConNombre): string {
  return nombreCompletoDe(m) || "Sin nombre";
}

/** Orden alfabético por "Nombre Apellido" (los "Sin nombre" al final). */
export function ordenarMiembros<T extends ConNombre>(lista: readonly T[]): T[] {
  return [...lista].sort((a, b) => {
    const na = nombreCompletoDe(a);
    const nb = nombreCompletoDe(b);
    if (!na && !nb) return 0;
    if (!na) return 1;
    if (!nb) return -1;
    return na.localeCompare(nb, "es", { sensitivity: "base" });
  });
}

/** Mensaje para el usuario a partir de un error de Supabase. */
export function adminErrorMessage(error: unknown, accion = "guardar el cambio"): string {
  if (isNetworkError(error) || (typeof navigator !== "undefined" && !navigator.onLine)) {
    return accion === "cargar los miembros" ? MSG_ADMIN_SIN_RED : "Sin conexión. El cambio no se guardó.";
  }
  const msg = error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? "");
  if (msg.includes("Solo un administrador")) return "Solo un administrador activo puede hacer este cambio.";
  return `No se pudo ${accion}. Inténtalo de nuevo.`;
}

export async function cargarMiembros(
  supabase: TypedSupabaseClient,
): Promise<{ miembros: Miembro[]; clubs: ClubOpcion[] }> {
  const [perfiles, clubs] = await Promise.all([
    supabase.from("profiles").select(COLUMNAS),
    supabase.from("clubs").select("id, nombre, tipo").order("nombre"),
  ]);
  if (perfiles.error) throw perfiles.error;
  if (clubs.error) throw clubs.error;
  return {
    miembros: ordenarMiembros(perfiles.data as Miembro[]),
    clubs: clubs.data as ClubOpcion[],
  };
}

/**
 * Aplica el cambio y devuelve la fila guardada.
 * @throws Error si la RLS no dejó actualizar (0 filas) o si falla la petición.
 */
export async function actualizarMiembro(
  supabase: TypedSupabaseClient,
  id: string,
  cambio: MiembroCambio,
): Promise<Miembro> {
  const { data, error } = await supabase.from("profiles").update(cambio).eq("id", id).select(COLUMNAS).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Solo un administrador activo puede hacer este cambio.");
  return data as Miembro;
}

/**
 * Un admin no puede quitarse el rol ni desactivarse a sí mismo (evita quedarse
 * sin administradores). Devuelve el motivo o `null` si el cambio está permitido.
 */
export function bloqueoPropio(
  selfId: string | null | undefined,
  miembro: Miembro,
  cambio: MiembroCambio,
): { title: string; description: string } | null {
  if (!selfId || miembro.id !== selfId) return null;
  if (cambio.rol === "miembro" && miembro.rol === "admin") {
    return {
      title: "No puedes quitarte el rol de administrador",
      description:
        "Así el grupo nunca se queda sin administradores. Si quieres dejar el rol, pide a otro administrador que lo cambie.",
    };
  }
  if (cambio.activo === false && miembro.activo) {
    return {
      title: "No puedes desactivar tu propio acceso",
      description: "Perderías el acceso a la app al instante. Si hace falta, pide a otro administrador que lo haga.",
    };
  }
  return null;
}

/** Cambios que piden confirmación antes de guardarse (sobre otro miembro). */
export function confirmacionNecesaria(
  miembro: Miembro,
  cambio: MiembroCambio,
): { title: string; description: string; confirmLabel: string } | null {
  const nombre = nombreVisible(miembro);
  if (cambio.activo === false && miembro.activo) {
    return {
      title: `¿Desactivar a ${nombre}?`,
      description: "No podrá entrar ni ver reportes hasta que lo vuelvas a activar. Sus reportes se conservan.",
      confirmLabel: "Desactivar acceso",
    };
  }
  if (cambio.rol === "miembro" && miembro.rol === "admin") {
    return {
      title: `¿Quitar el rol de administrador a ${nombre}?`,
      description: "Dejará de poder borrar reportes y de administrar miembros.",
      confirmLabel: "Quitar rol",
    };
  }
  return null;
}

/** Texto del aviso tras guardar. */
export function avisoGuardado(miembro: Miembro, cambio: MiembroCambio, clubs: readonly ClubOpcion[]): string {
  const nombre = nombreVisible(miembro);
  if (cambio.activo !== undefined) {
    return cambio.activo ? `Acceso de ${nombre} activado.` : `Acceso de ${nombre} desactivado.`;
  }
  if (cambio.rol !== undefined) return `Rol de ${nombre}: ${ROL_LABEL[cambio.rol]}.`;
  if (cambio.nombre !== undefined || cambio.apellido !== undefined) {
    return `Datos de ${nombreVisible(miembro)} guardados.`;
  }
  if (cambio.club_id !== undefined) {
    const club = clubs.find((c) => c.id === cambio.club_id);
    return club ? `${nombre} ahora es de ${club.nombre}.` : `${nombre} ya no tiene club asignado.`;
  }
  return "Cambio guardado.";
}
