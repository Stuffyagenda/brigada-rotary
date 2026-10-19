/**
 * Realtime: cambios de `public.reportes` (requiere
 * `supabase/migrations/002_realtime.sql`) y de `public.visitas` (migración 003)
 * en vivo. Solo con señal y sesión.
 *
 * Cada evento se aplica a Dexie respetando lo pendiente local: un reporte (o
 * una visita) con operaciones en la cola no se toca.
 *
 * Las visitas van en un canal aparte: si el servidor aún no tiene la tabla, un
 * error de ese canal no afecta a los reportes.
 */
import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { db, type ReporteLocal, type VisitaLocal } from "@/lib/db";
import type { TypedSupabaseClient } from "@/lib/supabase/client";
import { tieneCola, tieneColaVisita } from "@/lib/sync/outbox";
import { masNuevaLocal, masNuevoLocal, normalizarRemoto } from "@/lib/sync/pull";
import type { Reporte, Visita } from "@/lib/types";

let canal: RealtimeChannel | null = null;
let canalVisitas: RealtimeChannel | null = null;
let canalCliente: TypedSupabaseClient | null = null;

/** Aplica un evento de Realtime al espejo local. */
export async function aplicarCambioRealtime(payload: RealtimePostgresChangesPayload<Reporte>): Promise<void> {
  await db.transaction("rw", db.reportes, db.outbox, async () => {
    if (payload.eventType === "DELETE") {
      const id = payload.old?.id;
      if (!id || (await tieneCola(id))) return;
      const local = await db.reportes.get(id);
      if (local && local._sync === "synced") await db.reportes.delete(id);
      return;
    }
    const fila = payload.new;
    if (!fila?.id || (await tieneCola(fila.id))) return;
    const local = await db.reportes.get(fila.id);
    // Eventos desordenados: no retroceder a una versión más antigua.
    if (masNuevoLocal(local, fila)) return;
    const nuevo: ReporteLocal = { ...normalizarRemoto(fila), _sync: "synced" };
    await db.reportes.put(nuevo);
  });
}

/**
 * Aplica un evento de Realtime de `public.visitas` al espejo local: no toca una
 * visita con entradas en la cola, no retrocede una `synced` más nueva y solo
 * guarda visitas de reportes que están en el celular (las demás llegan con el
 * próximo pull).
 */
export async function aplicarCambioRealtimeVisita(payload: RealtimePostgresChangesPayload<Visita>): Promise<void> {
  await db.transaction("rw", db.visitas, db.reportes, db.outbox, async () => {
    if (payload.eventType === "DELETE") {
      const id = payload.old?.id;
      if (!id) return;
      const local = await db.visitas.get(id);
      if (!local || local._sync !== "synced") return;
      if (await tieneColaVisita(local.reporte_id, id)) return;
      await db.visitas.delete(id);
      return;
    }
    const fila = payload.new;
    if (!fila?.id || !fila.reporte_id) return;
    if (await tieneColaVisita(fila.reporte_id, fila.id)) return;
    if (!(await db.reportes.get(fila.reporte_id))) return;
    const local = await db.visitas.get(fila.id);
    // Eventos desordenados: no retroceder a una versión más antigua.
    if (masNuevaLocal(local, fila)) return;
    const nueva: VisitaLocal = { ...fila, _sync: "synced" };
    await db.visitas.put(nueva);
  });
}

/** `true` si hay una suscripción activa. */
export function realtimeActivo(): boolean {
  return canal !== null;
}

export interface SuscripcionOpciones {
  /** `false` si el servidor no tiene la tabla `visitas` (no se suscribe a ella). Por defecto `true`. */
  visitas?: boolean;
}

/** Se suscribe a los cambios de `public.reportes` y `public.visitas` (idempotente). */
export function suscribirRealtime(client: TypedSupabaseClient, opciones: SuscripcionOpciones = {}): void {
  if (canalCliente && canalCliente !== client) desuscribirRealtime();
  canalCliente = client;
  if (!canal) {
    canal = client
      .channel("brigada-reportes")
      .on<Reporte>("postgres_changes", { event: "*", schema: "public", table: "reportes" }, (payload) => {
        aplicarCambioRealtime(payload).catch((err: unknown) => {
          console.warn("No se pudo aplicar un cambio en vivo:", err);
        });
      })
      .subscribe();
  }
  if (!canalVisitas && opciones.visitas !== false) {
    canalVisitas = client
      .channel("brigada-visitas")
      .on<Visita>("postgres_changes", { event: "*", schema: "public", table: "visitas" }, (payload) => {
        aplicarCambioRealtimeVisita(payload).catch((err: unknown) => {
          console.warn("No se pudo aplicar una visita en vivo:", err);
        });
      })
      .subscribe();
  }
}

/** Cancela las suscripciones, si las hay. */
export function desuscribirRealtime(): void {
  const cliente = canalCliente;
  const canales = [canal, canalVisitas].filter((c): c is RealtimeChannel => c !== null);
  canal = null;
  canalVisitas = null;
  canalCliente = null;
  if (!cliente) return;
  for (const c of canales) cliente.removeChannel(c).catch(() => undefined);
}
