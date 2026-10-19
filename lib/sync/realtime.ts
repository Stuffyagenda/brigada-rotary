/**
 * Realtime: cambios de `public.reportes` en vivo (requiere
 * `supabase/migrations/002_realtime.sql`). Solo con señal y sesión.
 *
 * Cada evento se aplica a Dexie respetando lo pendiente local: un reporte con
 * operaciones en la cola no se toca.
 */
import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { db, type ReporteLocal } from "@/lib/db";
import type { TypedSupabaseClient } from "@/lib/supabase/client";
import { tieneCola } from "@/lib/sync/outbox";
import { masNuevoLocal, normalizarRemoto } from "@/lib/sync/pull";
import type { Reporte } from "@/lib/types";

let canal: RealtimeChannel | null = null;
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

/** `true` si hay una suscripción activa. */
export function realtimeActivo(): boolean {
  return canal !== null;
}

/** Se suscribe a los cambios de `public.reportes` (idempotente). */
export function suscribirRealtime(client: TypedSupabaseClient): void {
  if (canal) return;
  canalCliente = client;
  canal = client
    .channel("brigada-reportes")
    .on<Reporte>("postgres_changes", { event: "*", schema: "public", table: "reportes" }, (payload) => {
      aplicarCambioRealtime(payload).catch((err: unknown) => {
        console.warn("No se pudo aplicar un cambio en vivo:", err);
      });
    })
    .subscribe();
}

/** Cancela la suscripción, si la hay. */
export function desuscribirRealtime(): void {
  if (!canal || !canalCliente) return;
  const c = canal;
  const cliente = canalCliente;
  canal = null;
  canalCliente = null;
  cliente.removeChannel(c).catch(() => undefined);
}
