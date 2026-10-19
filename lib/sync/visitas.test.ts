/**
 * Sincronización de visitas: cola (orden y colapso), envío con la FK del
 * reporte, pull, Realtime, borrado y cierre de sesión.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, type ReporteLocal, type VisitaLocal } from "@/lib/db";
import { ejecutarSync } from "@/lib/sync/engine";
import { limpiarCacheFotos } from "@/lib/sync/foto";
import type { OutboxEntrySync } from "@/lib/sync/outbox";
import { reconciliarVisitas } from "@/lib/sync/pull";
import { MSG_VISITA_REPORTE_INEXISTENTE } from "@/lib/sync/push";
import { aplicarCambioRealtimeVisita, desuscribirRealtime } from "@/lib/sync/realtime";
import { getEngineState, resetEngineState } from "@/lib/sync/state";
import {
  createFakeSupabase,
  emitirRealtime,
  errorRed,
  filaRemota,
  visitaRemota,
} from "@/lib/sync/testing/fake-supabase";
import { deleteReport, limpiarEspejoLocal, saveReport, saveVisita, syncNow } from "@/lib/sync";
import { reporteVacio, visitaVacia, type Visita } from "@/lib/types";
import { hoyPanama } from "@/lib/vigencia";

const h = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase/client", () => ({ getSupabaseBrowserClient: () => h.client }));
vi.mock("@/lib/env", () => ({
  hasSupabaseEnv: () => true,
  getSupabaseEnv: () => ({ url: "https://x.supabase.co", publishableKey: "k" }),
}));

let fake: ReturnType<typeof createFakeSupabase>;
let online = true;
const setOnline = (v: boolean) => {
  online = v;
};

const R1 = "00000000-0000-4000-8000-0000000000a1";
const R2 = "00000000-0000-4000-8000-0000000000a2";
const V1 = "00000000-0000-4000-8000-0000000000b1";
const V2 = "00000000-0000-4000-8000-0000000000b2";
const V3 = "00000000-0000-4000-8000-0000000000b3";
const V4 = "00000000-0000-4000-8000-0000000000b4";

const AYER = () => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return hoyPanama(d);
};

async function entradas(): Promise<OutboxEntrySync[]> {
  return (await db.outbox.orderBy("seq").toArray()) as OutboxEntrySync[];
}

function reporteLocal(id: string, over: Partial<ReporteLocal> = {}): ReporteLocal {
  return { ...filaRemota({ id }), _sync: "synced", ...over };
}

function visitaLocal(base: Partial<Visita> & { id: string; reporte_id: string }, sync: VisitaLocal["_sync"] = "synced") {
  return { ...visitaRemota(base), _sync: sync } satisfies VisitaLocal;
}

/** Reporte guardado sin señal (queda en la cola). */
async function reporteOffline(id: string) {
  setOnline(false);
  await saveReport({ ...reporteVacio(7.96, -80.43), id });
}

const callsVisita = () => fake.state.calls.filter((c) => c.startsWith("visitas.upsert:"));

beforeEach(async () => {
  desuscribirRealtime();
  await db.delete();
  await db.open();
  fake = createFakeSupabase();
  h.client = fake.client;
  setOnline(true);
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => online });
  resetEngineState();
  limpiarCacheFotos();
});

afterEach(() => {
  desuscribirRealtime();
  vi.restoreAllMocks();
});

describe("saveVisita: cola", () => {
  it("sin señal encola la visita detrás del upsert del reporte", async () => {
    await reporteOffline(R1);
    const { id, status } = await saveVisita({ ...visitaVacia(R1, { brigadista: "Ana" }), id: V1, ent_agua: true });
    expect(status).toBe("pending");
    expect(id).toBe(V1);

    const cola = await entradas();
    expect(cola.map((e) => e.entidad ?? "reporte")).toEqual(["reporte", "visita"]);
    expect(cola[1].seq).toBeGreaterThan(cola[0].seq);
    expect(cola[1]).toMatchObject({ reporteId: R1, visitaId: V1, op: "upsert", payload: null, intentos: 0 });
    expect(cola[1].visitaPayload).toMatchObject({ id: V1, reporte_id: R1, ent_agua: true, brigadista_texto: "Ana" });
    expect(cola[1].visitaPayload).not.toHaveProperty("_sync");
    expect(cola[1].visitaPayload).not.toHaveProperty("created_by");
    expect(fake.state.calls).toEqual([]);
  });

  it("con el reporte ya sincronizado también encola primero el reporte", async () => {
    fake.state.rows.set(R1, filaRemota({ id: R1 }));
    await db.reportes.put(reporteLocal(R1));
    setOnline(false);
    await saveVisita({ ...visitaVacia(R1), id: V1, ent_lona: true });
    const cola = await entradas();
    expect(cola.map((e) => e.entidad ?? "reporte")).toEqual(["reporte", "visita"]);
    expect(cola[0].payload).toMatchObject({ estado: "ATENDIDO", ent_lona: true });
  });

  it("colapsa varios guardados de la misma visita en una entrada", async () => {
    await reporteOffline(R1);
    await saveVisita({ ...visitaVacia(R1), id: V1, ent_agua: true });
    await saveVisita({ ...visitaVacia(R1), id: V1, ent_agua: true, ent_lona: true });
    const visitas = (await entradas()).filter((e) => e.entidad === "visita");
    expect(visitas).toHaveLength(1);
    expect(visitas[0].visitaPayload?.ent_lona).toBe(true);
    expect(visitas[0].rev).toBe(2);
    expect(await db.outbox.count()).toBe(2);
  });

  it("al colapsar detrás de un upsert nuevo del reporte, la visita pasa al final de la cola", async () => {
    await reporteOffline(R1);
    await saveVisita({ ...visitaVacia(R1), id: V1, ent_agua: true });
    // El reporte sube y la visita falla por red: queda solo la entrada de la visita.
    setOnline(true);
    fake.state.upsertErrorPorId.set(V1, errorRed());
    await syncNow();
    expect((await entradas()).map((e) => e.entidad)).toEqual(["visita"]);

    setOnline(false);
    await saveVisita({ ...visitaVacia(R1), id: V1, ent_agua: true, ent_toldas: true });
    const cola = await entradas();
    expect(cola.map((e) => e.entidad ?? "reporte")).toEqual(["reporte", "visita"]);
    expect(cola[1].visitaPayload?.ent_toldas).toBe(true);
  });

  it("devuelve synced solo cuando el servidor confirmó reporte y visita", async () => {
    const { id, status } = await saveVisita({ ...visitaVacia((await saveReport(reporteVacio(7.96, -80.43))).id), ent_agua: true });
    expect(status).toBe("synced");
    expect((await db.visitas.get(id))?._sync).toBe("synced");
    expect(await db.outbox.count()).toBe(0);

    // La visita falla por red: el reporte queda en el servidor, la visita pendiente.
    const { id: r2 } = await saveReport({ ...reporteVacio(7.96, -80.43), id: R2 });
    fake.state.upsertErrorPorId.set(V2, errorRed());
    const res = await saveVisita({ ...visitaVacia(r2), id: V2, ent_agua: true });
    expect(res.status).toBe("pending");
    expect(fake.state.rows.get(R2)?.estado).toBe("ATENDIDO");
    expect((await db.visitas.get(V2))?._sync).toBe("pending");
  });
});

describe("push de visitas", () => {
  it("envía el reporte antes que la visita y marca la visita synced con la fila del servidor", async () => {
    await reporteOffline(R1);
    await saveVisita({ ...visitaVacia(R1), id: V1, ent_agua: true, observaciones: "Bien" });
    setOnline(true);
    const r = await syncNow();
    expect(r).toMatchObject({ subidos: 2, pendientes: 0 });
    expect(r.error).toBeUndefined();

    const iReporte = fake.state.calls.indexOf(`upsert:${R1}`);
    const iVisita = fake.state.calls.indexOf(`visitas.upsert:${V1}`);
    expect(iReporte).toBeGreaterThanOrEqual(0);
    expect(iVisita).toBeGreaterThan(iReporte);

    expect(fake.state.visitaBodies[0]).not.toHaveProperty("created_by");
    expect(fake.state.visitaBodies[0]).not.toHaveProperty("_sync");
    const local = await db.visitas.get(V1);
    expect(local).toMatchObject({ _sync: "synced", created_by: "user-1", observaciones: "Bien" });
    expect(await db.outbox.count()).toBe(0);
  });

  it("no envía la visita si su reporte fue rechazado; la visita sigue pendiente", async () => {
    await reporteOffline(R1);
    await saveVisita({ ...visitaVacia(R1), id: V1, ent_agua: true });
    // Otro reporte con su visita, que sí debe pasar.
    await reporteOffline(R2);
    await saveVisita({ ...visitaVacia(R2), id: V2, ent_agua: true });
    setOnline(true);
    fake.state.upsertErrorPorId.set(R1, { message: "new row violates row-level security policy", code: "42501", status: 403 });

    const r = await syncNow();
    expect(r.error).toMatch(/rechazó un reporte/);
    expect(callsVisita()).toEqual([`visitas.upsert:${V2}`]);
    expect((await db.reportes.get(R1))?._sync).toBe("error");
    expect((await db.visitas.get(V1))?._sync).toBe("pending");
    expect((await db.visitas.get(V2))?._sync).toBe("synced");
    const cola = await entradas();
    expect(cola.map((e) => [e.entidad ?? "reporte", e.reporteId])).toEqual([
      ["reporte", R1],
      ["visita", R1],
    ]);
    expect(cola[1].intentos).toBe(0);
    expect(cola[1].fatal).toBeFalsy();

    // Una pasada automática tampoco la envía mientras el reporte siga rechazado.
    await ejecutarSync(false);
    expect(callsVisita()).toEqual([`visitas.upsert:${V2}`]);

    // Al corregirse (reintento manual), van los dos en orden.
    const r2 = await syncNow();
    expect(r2.error).toBeUndefined();
    expect(callsVisita()).toEqual([`visitas.upsert:${V2}`, `visitas.upsert:${V1}`]);
    expect((await db.visitas.get(V1))?._sync).toBe("synced");
  });

  it("un error de red en la visita corta la pasada y la deja pendiente con backoff", async () => {
    await reporteOffline(R1);
    await saveVisita({ ...visitaVacia(R1), id: V1, ent_agua: true });
    setOnline(true);
    fake.state.upsertErrorPorId.set(V1, errorRed());
    const r = await syncNow();
    expect(r.error).toBeDefined();
    expect(fake.state.calls).not.toContain("select");
    const [e] = await entradas();
    expect(e).toMatchObject({ entidad: "visita", intentos: 1, fatal: false });
    expect(e.nextAttemptAt).toBeDefined();
    expect((await db.visitas.get(V1))?._sync).toBe("pending");
    expect((await db.reportes.get(R1))?._sync).toBe("synced");
  });

  it("si el reporte no existe en el servidor (FK 23503) la visita queda con error y la pasada sigue", async () => {
    // Reporte local ya atendido hoy; en el servidor lo borró un admin.
    await db.reportes.put(reporteLocal(R1, { estado: "ATENDIDO", attended_at: new Date().toISOString() }));
    fake.state.rows.set(R2, filaRemota({ id: R2 }));
    setOnline(false);
    // Visita de ayer: no actualiza el reporte, así que solo se encola la visita.
    await saveVisita({ ...visitaVacia(R1), id: V1, fecha: AYER(), ent_agua: true });
    expect((await entradas()).map((e) => e.entidad ?? "reporte")).toEqual(["visita"]);
    setOnline(true);

    const r = await syncNow();
    expect(r.error).toContain(MSG_VISITA_REPORTE_INEXISTENTE);
    expect(getEngineState().lastError).toContain(MSG_VISITA_REPORTE_INEXISTENTE);
    expect((await db.visitas.get(V1))?._sync).toBe("error");
    const [e] = await entradas();
    expect(e).toMatchObject({ entidad: "visita", fatal: true, lastError: MSG_VISITA_REPORTE_INEXISTENTE });
    // La pasada siguió hasta el pull; el reporte con cola no se borra del celular.
    expect(fake.state.calls).toContain("select");
    expect(await db.reportes.get(R1)).toBeDefined();
    expect((await db.reportes.get(R2))?._sync).toBe("synced");
  });

  it("una sesión vencida en la visita no borra nada", async () => {
    await reporteOffline(R1);
    await saveVisita({ ...visitaVacia(R1), id: V1, ent_agua: true });
    setOnline(true);
    fake.state.upsertErrorPorId.set(V1, { message: "JWT expired", code: "PGRST303", status: 401 });
    const r = await syncNow();
    expect(r.pendientes).toBe(1);
    const [e] = await entradas();
    expect(e).toMatchObject({ entidad: "visita", intentos: 0 });
    expect((await db.visitas.get(V1))?._sync).toBe("pending");
  });
});

describe("pull de visitas", () => {
  it("descarga las visitas paginadas de los reportes del celular", async () => {
    fake.state.rows.set(R1, filaRemota({ id: R1 }));
    for (let i = 0; i < 1005; i++) {
      const id = `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
      fake.state.visitas.set(id, visitaRemota({ id, reporte_id: R1 }));
    }
    const r = await syncNow();
    expect(r.error).toBeUndefined();
    expect(fake.state.calls.filter((c) => c === "visitas.select")).toHaveLength(2);
    expect(await db.visitas.where("reporte_id").equals(R1).count()).toBe(1005);
    expect((await db.visitas.toArray()).every((v) => v._sync === "synced")).toBe(true);
  });

  it("reconcilia: no pisa pendientes, no retrocede, borra synced ausentes y omite reportes ajenos", async () => {
    await reporteOffline(R1);
    await saveVisita({ ...visitaVacia(R1), id: V1, ent_agua: true });
    await db.visitas.put(visitaLocal({ id: V2, reporte_id: R1, visitado_at: "2026-10-05T00:00:00.000Z", observaciones: "nueva" }));
    await db.visitas.put(visitaLocal({ id: V3, reporte_id: R1 }));

    await reconciliarVisitas([
      visitaRemota({ id: V1, reporte_id: R1, ent_agua: false, observaciones: "servidor" }),
      visitaRemota({ id: V2, reporte_id: R1, visitado_at: "2026-10-04T00:00:00.000Z", observaciones: "vieja" }),
      visitaRemota({ id: V4, reporte_id: R2 }),
    ]);

    expect(await db.visitas.get(V1)).toMatchObject({ _sync: "pending", ent_agua: true });
    expect((await db.visitas.get(V2))?.observaciones).toBe("nueva");
    expect(await db.visitas.get(V3)).toBeUndefined();
    expect(await db.visitas.get(V4)).toBeUndefined();

    await reconciliarVisitas([
      visitaRemota({ id: V2, reporte_id: R1, visitado_at: "2026-10-06T00:00:00.000Z", observaciones: "editada" }),
    ]);
    expect((await db.visitas.get(V2))?.observaciones).toBe("editada");
    // La pendiente nunca se borra aunque no esté en el servidor.
    expect((await db.visitas.get(V1))?._sync).toBe("pending");
  });

  it("si el servidor no tiene la tabla visitas, el pull de reportes sigue y no hay error para el usuario", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    fake.state.visitasAusente = true;
    fake.state.rows.set(R1, filaRemota({ id: R1, adultos: 4 }));
    await db.visitas.put(visitaLocal({ id: V1, reporte_id: R1 }));

    const r = await syncNow();
    expect(r.error).toBeUndefined();
    expect(getEngineState().lastError).toBeUndefined();
    expect((await db.reportes.get(R1))?.adultos).toBe(4);
    // No se toca lo local ni se suscribe a Realtime de visitas.
    expect(await db.visitas.get(V1)).toBeDefined();
    expect(fake.state.suscripciones.map((s) => s.table)).toEqual(["reportes"]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toMatch(/visitas/);
  });

  it("un error de red al descargar visitas no marca la sincronización como hecha", async () => {
    fake.state.rows.set(R1, filaRemota({ id: R1 }));
    fake.state.visitasSelectError = errorRed();
    const r = await syncNow();
    expect(r.error).toBeDefined();
    expect(await db.meta.get("lastSyncAt")).toBeUndefined();
  });
});

describe("Realtime de visitas", () => {
  const base = { schema: "public", table: "visitas", commit_timestamp: "", errors: [] };

  it("aplica INSERT/UPDATE/DELETE respetando pendientes, orden y reportes del celular", async () => {
    await reporteOffline(R1);
    await saveVisita({ ...visitaVacia(R1), id: V1, ent_agua: true });

    // Pendiente local: ni UPDATE ni DELETE la tocan.
    await aplicarCambioRealtimeVisita({ ...base, eventType: "UPDATE", new: visitaRemota({ id: V1, reporte_id: R1 }), old: {} });
    await aplicarCambioRealtimeVisita({ ...base, eventType: "DELETE", new: {}, old: { id: V1 } });
    expect(await db.visitas.get(V1)).toMatchObject({ _sync: "pending", ent_agua: true });

    // INSERT de otra visita del mismo reporte.
    const v2 = visitaRemota({ id: V2, reporte_id: R1, visitado_at: "2026-10-05T00:00:00.000Z", observaciones: "a" });
    await aplicarCambioRealtimeVisita({ ...base, eventType: "INSERT", new: v2, old: {} });
    expect(await db.visitas.get(V2)).toMatchObject({ _sync: "synced", observaciones: "a" });

    // Un evento más viejo llega tarde: no retrocede.
    await aplicarCambioRealtimeVisita({
      ...base,
      eventType: "UPDATE",
      new: { ...v2, visitado_at: "2026-10-04T00:00:00.000Z", observaciones: "vieja" },
      old: {},
    });
    expect((await db.visitas.get(V2))?.observaciones).toBe("a");

    // Visita de un reporte que no está en el celular: se ignora (llega con el pull).
    await aplicarCambioRealtimeVisita({ ...base, eventType: "INSERT", new: visitaRemota({ id: V3, reporte_id: R2 }), old: {} });
    expect(await db.visitas.get(V3)).toBeUndefined();

    await aplicarCambioRealtimeVisita({ ...base, eventType: "DELETE", new: {}, old: { id: V2 } });
    expect(await db.visitas.get(V2)).toBeUndefined();
  });

  it("tras sincronizar, el motor se suscribe a public.visitas y aplica los eventos", async () => {
    fake.state.rows.set(R1, filaRemota({ id: R1 }));
    await syncNow();
    expect(fake.state.suscripciones.map((s) => s.table).sort()).toEqual(["reportes", "visitas"]);

    emitirRealtime(fake.state, "visitas", {
      eventType: "INSERT",
      new: visitaRemota({ id: V1, reporte_id: R1, ent_agua: true }),
      old: {},
    });
    await vi.waitFor(async () => {
      expect((await db.visitas.get(V1))?._sync).toBe("synced");
    });

    desuscribirRealtime();
    expect(fake.state.suscripciones).toEqual([]);
  });
});

describe("deleteReport con visitas", () => {
  it("si el DELETE falla, devuelve a la cola también las visitas pendientes, en su orden", async () => {
    fake.state.rows.set(R1, filaRemota({ id: R1 }));
    await reporteOffline(R1);
    await saveVisita({ ...visitaVacia(R1), id: V1, ent_agua: true });
    const antes = await entradas();
    setOnline(true);
    fake.state.deleteError = { message: "permission denied for table reportes", code: "42501", status: 403 };
    await expect(deleteReport(R1)).rejects.toThrow("No se pudo borrar el reporte");
    const despues = await entradas();
    expect(despues.map((e) => [e.seq, e.entidad ?? "reporte"])).toEqual(antes.map((e) => [e.seq, e.entidad ?? "reporte"]));
    expect((await db.visitas.get(V1))?._sync).toBe("pending");
  });

  it("al confirmar, no envía la visita pendiente y la borra del celular (cascade en el servidor)", async () => {
    fake.state.rows.set(R1, filaRemota({ id: R1 }));
    fake.state.visitas.set(V2, visitaRemota({ id: V2, reporte_id: R1 }));
    await db.visitas.put(visitaLocal({ id: V2, reporte_id: R1 }));
    await reporteOffline(R1);
    await saveVisita({ ...visitaVacia(R1), id: V1, ent_agua: true });
    setOnline(true);

    await deleteReport(R1);
    await syncNow();
    expect(callsVisita()).toEqual([]);
    expect(fake.state.rows.has(R1)).toBe(false);
    expect(fake.state.visitas.size).toBe(0);
    expect(await db.visitas.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
  });
});

describe("limpiarEspejoLocal con visitas", () => {
  it("borra las visitas sincronizadas y conserva las pendientes con su reporte", async () => {
    await db.reportes.put(reporteLocal(R2));
    await db.visitas.put(visitaLocal({ id: V2, reporte_id: R2 }));
    await reporteOffline(R1);
    await saveVisita({ ...visitaVacia(R1), id: V1, ent_agua: true });

    expect(await limpiarEspejoLocal()).toBe(1);
    expect(await db.visitas.get(V2)).toBeUndefined();
    expect(await db.reportes.get(R2)).toBeUndefined();
    expect((await db.visitas.get(V1))?._sync).toBe("pending");
    expect(await db.reportes.get(R1)).toBeDefined();
    expect(await db.outbox.count()).toBe(2);
  });
});
