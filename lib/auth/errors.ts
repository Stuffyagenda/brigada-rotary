/**
 * Mensajes de error de autenticación para el usuario (en español).
 */
import { isAuthApiError, isAuthError, isAuthRetryableFetchError, isAuthWeakPasswordError } from "@supabase/supabase-js";

export const MSG_CREDENCIALES = "Correo o contraseña incorrectos.";
export const MSG_SIN_CONEXION = "Sin conexión. El primer inicio de sesión necesita internet.";
export const MSG_SIN_CONFIG =
  "La app no está configurada: faltan las variables de Supabase. Avisa a quien la administra.";
export const MSG_EMAIL_SIN_CONFIRMAR =
  "Tu correo todavía no está confirmado. Abre el enlace del correo que te enviamos o pide ayuda a un administrador.";
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

// ---------------------------------------------------------------------------
// Registro (`auth.signUp`)
// ---------------------------------------------------------------------------

export const MSG_REGISTRO_SIN_CONEXION = "Necesitas conexión para crear una cuenta.";
export const MSG_REGISTRO_YA_EXISTE = "Ya existe una cuenta con ese correo. Inicia sesión.";
export const MSG_REGISTRO_DESACTIVADO = "El registro está desactivado. Pide a un administrador que lo active.";
export const MSG_REGISTRO_CONTRASENA_DEBIL =
  "La contraseña es muy fácil de adivinar. Elige una más larga, con letras y números.";
export const MSG_REGISTRO_CONTRASENA_FILTRADA =
  "Esa contraseña aparece en filtraciones conocidas. Elige otra que no uses en otros sitios.";
export const MSG_REGISTRO_CORREO_INVALIDO = "Revisa el correo: no parece una dirección válida.";
export const MSG_REGISTRO_CORREO_NO_AUTORIZADO =
  "No podemos enviar correos a esa dirección. Usa otra o pide ayuda a un administrador.";
export const MSG_REGISTRO_LIMITE_CORREOS =
  "Se enviaron demasiados correos de confirmación. Espera unos minutos y vuelve a intentarlo.";
export const MSG_REGISTRO_GENERICO = "No pudimos crear la cuenta. Inténtalo de nuevo en unos segundos.";

/** Mensaje de error del registro y el campo al que corresponde (si hay uno). */
export interface SignUpError {
  mensaje: string;
  campo?: "email" | "password";
}

/**
 * Traduce un error de `signUp` (códigos de Supabase Auth, `ErrorCode` de
 * `@supabase/auth-js`) a un mensaje claro en español.
 * @param online valor de `navigator.onLine` (sin red siempre gana).
 */
export function signUpErrorMessage(error: unknown, online = true): SignUpError {
  if (!online || esErrorDeRed(error)) return { mensaje: MSG_REGISTRO_SIN_CONEXION };
  if (error instanceof Error && error.message.startsWith("Falta la variable de entorno")) {
    return { mensaje: MSG_SIN_CONFIG };
  }
  if (isAuthWeakPasswordError(error)) {
    const filtrada = error.reasons.includes("pwned");
    return {
      mensaje: filtrada ? MSG_REGISTRO_CONTRASENA_FILTRADA : MSG_REGISTRO_CONTRASENA_DEBIL,
      campo: "password",
    };
  }
  if (isAuthError(error)) {
    switch (error.code) {
      case "user_already_exists":
      case "email_exists":
        return { mensaje: MSG_REGISTRO_YA_EXISTE, campo: "email" };
      case "weak_password":
        return { mensaje: MSG_REGISTRO_CONTRASENA_DEBIL, campo: "password" };
      case "signup_disabled":
      case "email_provider_disabled":
        return { mensaje: MSG_REGISTRO_DESACTIVADO };
      case "email_address_invalid":
        return { mensaje: MSG_REGISTRO_CORREO_INVALIDO, campo: "email" };
      case "email_address_not_authorized":
        return { mensaje: MSG_REGISTRO_CORREO_NO_AUTORIZADO, campo: "email" };
      case "over_email_send_rate_limit":
        return { mensaje: MSG_REGISTRO_LIMITE_CORREOS };
      case "over_request_rate_limit":
        return { mensaje: MSG_DEMASIADOS_INTENTOS };
    }
    if (error.status === 429) return { mensaje: MSG_DEMASIADOS_INTENTOS };
    // Servidores antiguos sin `code`: "User already registered".
    if (/already registered/i.test(error.message)) return { mensaje: MSG_REGISTRO_YA_EXISTE, campo: "email" };
  }
  return { mensaje: MSG_REGISTRO_GENERICO };
}
