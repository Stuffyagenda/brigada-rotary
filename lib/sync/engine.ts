/**
 * Orquestación del motor de sync: una sola pasada a la vez (cola), operaciones
 * exclusivas, disparadores automáticos y suscripción a Realtime según la sesión y la red.
 *
 * Una pasada = enviar la cola (push) y, si todo fue bien, descargar y reconciliar (pull).
 */
import { db } from "@/lib/db";
import type { TypedSupabaseClient } from "@/lib/supabase/client";
import { getSyncClient, isOnline } from "@/lib/sync/client";
import {
  clasificarError,
  mensajeDe,
  MSG_RED_INESTABLE,
  MSG_SESION,
  MSG_SIN_CONFIG,
  MSG_SIN_RED,
} from "@/lib/sync/errors";
import { pullReportes } from "@/lib/sync/pull";
import { pushOutbox } from "@/lib/sync/push";
import { desuscribirRealtime, suscribirRealtime } from "@/lib/sync/realtime";
import { META_LAST_SYNC, setEngineState } from "@/lib/sync/state";

/** Resultado de una pasada (mismo contrato que `SyncNowResult`). */
export interface PasadaResult {
  subidos: number;
  pendientes: number;
  error?: string;
}

/** Intervalo de sincronización automática con señal. */
export const INTERVALO_MS = 60_000;

async function contarPendientes(): Promise<number> {
  return db.outbox.count();
}

async function haySesion(client: TypedSupabaseClient): Promise<boolean> {
  const { data, error } = await client.auth.getSession();
  if (error) {
    if (clasificarError(error) === "network") throw error;
    return false;
  }
  return Boolean(data.session);
}

async function pasada(force: boolean): Promise<PasadaResult> {
  if (!isOnline()) return { subidos: 0, pendientes: await contarPendientes(), error: MSG_SIN_RED };
  const client = getSyncClient();
  if (!client) return { subidos: 0, pendientes: await contarPendientes(), error: MSG_SIN_CONFIG };

  setEngineState({ syncing: true });
  let subidos = 0;
  try {
    if (!(await haySesion(client))) {
      // Sin sesión no se borra nada: la cola espera al próximo inicio de sesión.
      desuscribirRealtime();
      const pendientes = await contarPendientes();
      setEngineState({ lastError: pendientes > 0 ? MSG_SESION : undefined });
      return { subidos: 0, pendientes, error: MSG_SESION };
    }

    const push = await pushOutbox(client, force);
    subidos = push.subidos;
    if (push.stop === "auth") {
      setEngineState({ lastError: MSG_SESION });
      desuscribirRealtime();
      return { subidos, pendientes: await contarPendientes(), error: MSG_SESION };
    }
    if (push.stop === "network") {
      const error = isOnline() ? MSG_RED_INESTABLE : MSG_SIN_RED;
      setEngineState({ lastError: isOnline() ? MSG_RED_INESTABLE : undefined });
      return { subidos, pendientes: await contarPendientes(), error };
    }

    await pullReportes(client);
    await db.meta.put({ key: META_LAST_SYNC, value: new Date().toISOString() });
    setEngineState({ lastError: push.error });
    if (isOnline()) suscribirRealtime(client);
    return { subidos, pendientes: await contarPendientes(), error: push.error };
  } catch (err) {
    const kind = clasificarError(err);
    let error: string;
    if (kind === "auth") {
      error = MSG_SESION;
      desuscribirRealtime();
    } else if (kind === "network") {
      error = isOnline() ? MSG_RED_INESTABLE : MSG_SIN_RED;
    } else {
      error = `No se pudo sincronizar: ${mensajeDe(err)}`;
    }
    setEngineState({ lastError: kind === "network" && !isOnline() ? undefined : error });
    return { subidos, pendientes: await contarPendientes(), error };
  } finally {
    setEngineState({ syncing: false });
  }
}

// ---------------------------------------------------------------------------
// Cola del motor: las pasadas y las operaciones exclusivas (borrar un reporte,
// limpiar el espejo local al cerrar sesión) se ejecutan de una en una y en orden.
// Una llamada a `ejecutarSync` mientras ya hay una pasada esperando turno se une
// a ella (todas las llamadas intermedias la comparten).
// ---------------------------------------------------------------------------

let cola: Promise<unknown> = Promise.resolve();
let enEspera: { promesa: Promise<PasadaResult>; force: boolean } | null = null;

function encolar<T>(fn: () => Promise<T>): Promise<T> {
  const p = cola.then(fn);
  cola = p.catch(() => undefined);
  return p;
}

/**
 * Ejecuta una pasada de sincronización respetando la cola.
 * @param force `true` ignora el backoff y reintenta las entradas rechazadas.
 */
export function ejecutarSync(force: boolean): Promise<PasadaResult> {
  if (enEspera) {
    enEspera.force = enEspera.force || force;
    return enEspera.promesa;
  }
  const turno: { promesa: Promise<PasadaResult>; force: boolean } = {
    promesa: Promise.resolve({ subidos: 0, pendientes: 0 }),
    force,
  };
  turno.promesa = encolar(() => {
    // Desde aquí, una nueva llamada programa otra pasada detrás de esta.
    if (enEspera === turno) enEspera = null;
    return pasada(turno.force);
  });
  enEspera = turno;
  return turno.promesa;
}

/**
 * Ejecuta `fn` en exclusiva: después de la pasada en curso (y de la que ya esté
 * programada) y antes de cualquier pasada pedida mientras tanto. Ninguna pasada
 * corre a la vez que `fn`.
 */
export function ejecutarExclusivo<T>(fn: () => Promise<T>): Promise<T> {
  // Una pasada que esperaba turno ya no admite más llamadas: las siguientes van detrás de `fn`.
  enEspera = null;
  return encolar(fn);
}

/** Espera a que terminen las pasadas y operaciones en cola. */
export async function esperarSync(): Promise<void> {
  let actual: Promise<unknown>;
  do {
    actual = cola;
    await actual;
  } while (actual !== cola);
}

// ---------------------------------------------------------------------------
// Disparadores
// ---------------------------------------------------------------------------

let referencias = 0;
let detener: (() => void) | null = null;

function automatico(): void {
  if (isOnline()) void ejecutarSync(false);
}

function arrancar(): () => void {
  const client = getSyncClient();

  const onOnline = () => automatico();
  const onOffline = () => desuscribirRealtime();
  const onVisible = () => {
    if (document.visibilityState === "visible") automatico();
  };
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  document.addEventListener("visibilitychange", onVisible);
  const timer = window.setInterval(automatico, INTERVALO_MS);

  let cancelarAuth: (() => void) | undefined;
  if (client) {
    const { data } = client.auth.onAuthStateChange((event, session) => {
      // No llamar a Supabase dentro del callback (puede bloquear el cliente de Auth).
      window.setTimeout(() => {
        if (!session) desuscribirRealtime();
        // INITIAL_SESSION sin sesión también sincroniza: así se avisa si hay reportes esperando.
        if (event === "INITIAL_SESSION" || (event === "SIGNED_IN" && session)) automatico();
      }, 0);
    });
    cancelarAuth = () => data.subscription.unsubscribe();
  }

  return () => {
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    document.removeEventListener("visibilitychange", onVisible);
    window.clearInterval(timer);
    cancelarAuth?.();
    desuscribirRealtime();
  };
}

/**
 * Arranca el motor de sync en el navegador. Idempotente: varias llamadas
 * comparten un solo motor; se detiene cuando se llaman todas las funciones
 * devueltas. En el servidor no hace nada.
 * @returns función para detenerlo.
 */
export function startSyncEngine(): () => void {
  if (typeof window === "undefined") return () => undefined;
  referencias += 1;
  if (!detener) detener = arrancar();
  let detenido = false;
  return () => {
    if (detenido) return;
    detenido = true;
    referencias -= 1;
    if (referencias === 0 && detener) {
      detener();
      detener = null;
    }
  };
}
