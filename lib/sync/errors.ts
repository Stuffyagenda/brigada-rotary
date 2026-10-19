/**
 * Clasificación de errores de Supabase (PostgREST, Storage, Auth) para decidir
 * si una operación de la cola se reintenta, se marca como error o detiene la
 * sincronización hasta que el usuario vuelva a iniciar sesión.
 */
import { isOnline } from "@/lib/sync/client";

/**
 * - `network`: sin señal, tiempo agotado o fallo del servidor (5xx, 429). Se reintenta.
 * - `auth`: sesión inexistente o vencida. La cola se conserva y se espera un nuevo inicio de sesión.
 * - `fatal`: el servidor rechazó los datos (SQLSTATE 22/23/42 como RLS 42501, check 23514
 *   o FK 23503; PGRST1xx/2xx; otros 4xx). No se reintenta solo.
 */
export type ErrorKind = "network" | "auth" | "fatal";

export const MSG_SESION = "Tu sesión venció. Inicia sesión para enviar los reportes pendientes.";
export const MSG_SIN_RED =
  "Sin señal. Los reportes quedan en este celular y se enviarán solos cuando vuelva la conexión.";
export const MSG_RED_INESTABLE =
  "No se pudo conectar con el servidor. Los reportes quedan en este celular y se reintentará en breve.";
export const MSG_SIN_CONFIG = "La app no tiene configurado el servidor (Supabase).";

/** Forma mínima común a PostgrestError, StorageError y AuthError. */
interface ErrorLike {
  message?: unknown;
  code?: unknown;
  status?: unknown;
  statusCode?: unknown;
  name?: unknown;
}

/** Error del motor de sync con su clasificación. */
export class SyncError extends Error {
  readonly kind: ErrorKind;
  constructor(kind: ErrorKind, message: string) {
    super(message);
    this.name = "SyncError";
    this.kind = kind;
  }
}

function texto(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function numero(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && /^\d+$/.test(v)) return Number(v);
  return undefined;
}

const CODIGOS_AUTH = new Set(["PGRST301", "PGRST302", "PGRST303"]);
const RE_AUTH = /jwt|token (is )?expired|exp claim|invalid claim|refresh token|session (missing|not found)|auth session missing/i;
const RE_RED = /failed to fetch|fetcherror|networkerror|network request failed|load failed|timed? ?out|aborted|econn|enotfound/i;

/** Mensaje legible de cualquier error. */
export function mensajeDe(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (err && typeof err === "object") {
    const m = texto((err as ErrorLike).message);
    if (m) return m;
  }
  return typeof err === "string" && err ? err : "Error desconocido.";
}

/**
 * Añade al error de PostgREST el `status` HTTP de la respuesta. `postgrest-js`
 * devuelve el `status` junto a `error` (no dentro): sin esto, un 4xx no se
 * distinguiría de un fallo de red.
 */
export function conStatus<E extends object>(error: E, status: number | undefined): E & { status?: number } {
  if (status === undefined || (error as ErrorLike).status !== undefined) return error;
  return Object.assign(error, { status });
}

/** SQLSTATE de datos inválidos (22), restricciones (23) o permisos/sintaxis (42), p. ej. 23514, 23503, 42501. */
const RE_SQLSTATE_FATAL = /^(22|23|42)[0-9A-Z]{3}$/;
/** Errores de PostgREST por la petición (PGRST1xx) o el esquema (PGRST2xx). */
const RE_PGRST_FATAL = /^PGRST[12]\d\d$/;

/** Decide qué hacer con un error devuelto por Supabase o lanzado por `fetch`. */
export function clasificarError(err: unknown): ErrorKind {
  if (err instanceof SyncError) return err.kind;
  if (!isOnline()) return "network";
  const e = (err && typeof err === "object" ? err : {}) as ErrorLike;
  const mensaje = mensajeDe(err);
  const code = texto(e.code);
  const status = numero(e.status);
  const statusCode = numero(e.statusCode);
  const http = status ?? statusCode;

  // Sesión: JWT vencido o inválido, o sin sesión.
  if (CODIGOS_AUTH.has(code) || http === 401 || RE_AUTH.test(mensaje)) return "auth";
  if (texto(e.name) === "AuthSessionMissingError") return "auth";

  // Sin conexión o tiempo agotado (fetch lanza TypeError; postgrest-js responde status 0).
  if (RE_RED.test(mensaje) || texto(e.name) === "TypeError") return "network";

  // Rechazo del servidor por los datos: no se reintenta solo.
  if (RE_SQLSTATE_FATAL.test(code) || RE_PGRST_FATAL.test(code)) return "fatal";

  if (http === undefined || http === 0) return "network";
  if (http >= 500 || http === 408 || http === 425 || http === 429) return "network";
  if (http >= 400) return "fatal";
  return "network";
}
