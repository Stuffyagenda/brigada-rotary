/**
 * Nombre y apellido de un miembro: cómo se muestran, cómo se validan y cómo
 * cambia cada uno los suyos (las usan el registro, el menú de cuenta y /miembros).
 */
import { isNetworkError } from "@/lib/auth/errors";
import type { TypedSupabaseClient } from "@/lib/supabase/client";

/** Máximo que guarda `handle_new_user()` por campo (migración 003). */
export const NOMBRE_MAX = 120;

export interface NombreApellido {
  nombre?: string | null;
  apellido?: string | null;
  nombre_completo?: string | null;
}

/**
 * "Nombre Apellido" si hay nombre o apellido; si no, `nombre_completo`
 * (perfiles creados antes de la migración 003). Cadena vacía si no hay nada.
 */
export function nombreCompletoDe(p: NombreApellido | null | undefined): string {
  if (!p) return "";
  const partes = [p.nombre, p.apellido].map((v) => v?.trim() ?? "").filter(Boolean);
  if (partes.length) return partes.join(" ");
  return p.nombre_completo?.trim() ?? "";
}

export type ErroresNombre = Partial<Record<"nombre" | "apellido", string>>;

/**
 * Valida nombre y apellido (obligatorios, máx. 120). Devuelve los errores por campo.
 * @param propio `false` cuando un admin edita a otro miembro ("el nombre" en vez de "tu nombre").
 */
export function validarNombreApellido(nombre: string, apellido: string, propio = true): ErroresNombre {
  const errores: ErroresNombre = {};
  const n = nombre.trim();
  const a = apellido.trim();
  const su = propio ? "tu" : "el";
  if (!n) errores.nombre = `Escribe ${su} nombre.`;
  else if (n.length > NOMBRE_MAX) errores.nombre = `Máximo ${NOMBRE_MAX} caracteres.`;
  if (!a) errores.apellido = `Escribe ${su} apellido.`;
  else if (a.length > NOMBRE_MAX) errores.apellido = `Máximo ${NOMBRE_MAX} caracteres.`;
  return errores;
}

export const MSG_DATOS_SIN_CONEXION = "Sin conexión. Necesitas internet para cambiar tus datos.";
export const MSG_DATOS_ERROR = "No se pudieron guardar tus datos. Inténtalo de nuevo.";

/**
 * Cambia el nombre y apellido del propio perfil (RLS "cada uno edita el suyo").
 * No se envía `nombre_completo`: lo recalcula el trigger `protect_profile_fields`.
 * @throws Error con un mensaje para el usuario.
 */
export async function actualizarMisDatos(
  supabase: TypedSupabaseClient,
  userId: string,
  datos: { nombre: string; apellido: string },
): Promise<void> {
  if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error(MSG_DATOS_SIN_CONEXION);
  let resultado;
  try {
    resultado = await supabase
      .from("profiles")
      .update({ nombre: datos.nombre, apellido: datos.apellido })
      .eq("id", userId)
      .select("id")
      .maybeSingle();
  } catch (error) {
    throw new Error(isNetworkError(error) ? MSG_DATOS_SIN_CONEXION : MSG_DATOS_ERROR);
  }
  if (resultado.error) {
    throw new Error(isNetworkError(resultado.error) ? MSG_DATOS_SIN_CONEXION : MSG_DATOS_ERROR);
  }
  // 0 filas: la RLS no dejó actualizar (sesión caducada u otro usuario).
  if (!resultado.data) throw new Error(MSG_DATOS_ERROR);
}
