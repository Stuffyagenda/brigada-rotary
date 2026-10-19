/**
 * Mensajes de error de autenticación para el usuario (en español).
 */
import { isAuthApiError, isAuthRetryableFetchError } from "@supabase/supabase-js";

export const MSG_CREDENCIALES = "Correo o contraseña incorrectos.";
export const MSG_SIN_CONEXION = "Sin conexión. El primer inicio de sesión necesita internet.";
export const MSG_SIN_CONFIG =
  "La app no está configurada: faltan las variables de Supabase. Avisa a quien la administra.";
export const MSG_EMAIL_SIN_CONFIRMAR =
  "Tu correo todavía no está confirmado. Pide a un administrador que lo confirme.";
export const MSG_DEMASIADOS_INTENTOS = "Demasiados intentos. Espera un minuto y vuelve a intentarlo.";
export const MSG_GENERICO = "No pudimos iniciar sesión. Inténtalo de nuevo en unos segundos.";

function esErrorDeRed(error: unknown): boolean {
  if (isAuthRetryableFetchError(error)) return true;
  if (error instanceof TypeError) return true; // fetch() lanza TypeError sin red
  const msg = error instanceof Error ? error.message : "";
  return /failed to fetch|network|load failed/i.test(msg);
}

/**
 * Traduce un error de `signInWithPassword` a un mensaje claro.
 * @param online valor de `navigator.onLine` (sin red siempre gana).
 */
export function loginErrorMessage(error: unknown, online = true): string {
  if (!online || esErrorDeRed(error)) return MSG_SIN_CONEXION;
  if (error instanceof Error && error.message.startsWith("Falta la variable de entorno")) return MSG_SIN_CONFIG;
  if (isAuthApiError(error)) {
    if (error.code === "email_not_confirmed") return MSG_EMAIL_SIN_CONFIRMAR;
    if (error.status === 429 || error.code === "over_request_rate_limit") return MSG_DEMASIADOS_INTENTOS;
    if (error.code === "invalid_credentials" || error.status === 400) return MSG_CREDENCIALES;
  }
  return MSG_GENERICO;
}

/** `true` si el error significa "no se pudo contactar con Supabase" (no "no hay sesión"). */
export function isNetworkError(error: unknown): boolean {
  return esErrorDeRed(error);
}
