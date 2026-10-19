import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, type ReporteLocal } from "@/lib/db";
import { META_ULTIMO_BRIGADISTA } from "@/lib/brigadista";
import { clasificarError, conStatus, MSG_BORRAR_SIN_RED, MSG_BORRAR_SOLO_ADMIN, MSG_SESION } from "@/lib/sync/errors";
import { limpiarCacheFotos } from "@/lib/sync/foto";
import type { OutboxEntrySync } from "@/lib/sync/outbox";
import { reconciliar } from "@/lib/sync/pull";
import { aplicarCambioRealtime } from "@/lib/sync/realtime";
import { getEngineState, resetEngineState } from "@/lib/sync/state";
import { createFakeSupabase, errorRed, filaRemota } from "@/lib/sync/testing/fake-supabase";
import { uuid } from "@/lib/sync/uuid";
import { reporteVacio, type Reporte } from "@/lib/types";
import { ejecutarSync, esperarSync } from "@/lib/sync/engine";
import {
  deleteReport,
  getFotoPendiente,
  getFotoUrl,
  limpiarEspejoLocal,
  MSG_VISITA_SIN_REPORTE,
  saveReport,
  saveVisita,
  syncNow,
} from "@/lib/sync";
import { BrigadaDB, type OutboxEntry, type VisitaLocal } from "@/lib/db";
import Dexie from "dexie";
import { visitaVacia } from "@/lib/types";
import { fechaPanama, hoyPanama } from "@/lib/vigencia";

// El cliente de Supabase se sustituye por uno en memoria.
const h = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase/client", () => ({ getSupabaseBrowserClient: () => h.client }));
vi.mock("@/lib/env", () => ({
  hasSupabaseEnv: () => true,
  getSupabaseEnv: () => ({ url: "https://x.supabase.co", publishableKey: "k" }),
}));

let fake: ReturnType<typeof createFakeSupabase>;
let online = true;

function setOnline(v: boolean) {
  online = v;
}

const ID_A = "00000000-0000-4000-8000-00000000000a";
const ID_B = "00000000-0000-4000-8000-00000000000b";
const ID_C = "00000000-0000-4000-8000-00000000000c";
const ID_D = "00000000-0000-4000-8000-00000000000d";

const foto = () => new Blob(["jpeg"], { type: "image/jpeg" });

async function entradas(): Promise<OutboxEntrySync[]> {
  return (await db.outbox.orderBy("seq").toArray()) as OutboxEntrySync[];
}

function local(id: string, over: Partial<ReporteLocal> = {}): ReporteLocal {
  return { ...filaRemota({ id }), _sync: "synced", ...over };
}

beforeEach(async () => {
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
  vi.restoreAllMocks();
});

describe("saveReport", () => {
  it("sin red guarda en Dexie como pendiente y encola un upsert", async () => {
    setOnline(false);
    const { id, status } = await saveReport({ ...reporteVacio(7.96, -80.43), adultos: 2, menores: 3 });
    expect(status).toBe("pending");
    const r = await db.reportes.get(id);
    expect(r?._sync).toBe("pending");
    expect(r?.total_personas).toBe(5);
    const outbox = await entradas();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ reporteId: id, op: "upsert", intentos: 0 });
    expect(outbox[0].payload).not.toHaveProperty("total_personas");
    expect(fake.state.calls).toEqual([]);
  });

  it("conserva created_at al editar y fija attended_at al atender", async () => {
    setOnline(false);
    const { id } = await saveReport(reporteVacio(7.96, -80.43));
    const antes = await db.reportes.get(id);
    await saveReport({ ...reporteVacio(7.96, -80.43), id, estado: "ATENDIDO" });
    const despues = await db.reportes.get(id);
    expect(despues?.created_at).toBe(antes?.created_at);
    expect(despues?.attended_at).toBeTruthy();
  });

  it("rechaza datos inválidos sin tocar la base", async () => {
    await expect(saveReport({ ...reporteVacio(7.96, -80.43), adultos: -1 })).rejects.toThrow();
    expect(await db.reportes.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
  });

  it("colapsa la cola: un solo upsert por reporte y conserva la foto si la nueva es null", async () => {
    setOnline(false);
    const { id } = await saveReport(reporteVacio(7.96, -80.43), foto());
    await saveReport({ ...reporteVacio(7.96, -80.43), id, adultos: 4 }, null);
    const outbox = await entradas();
    expect(outbox).toHaveLength(1);
    expect(outbox[0].payload?.adultos).toBe(4);
    expect(outbox[0].foto).toBeDefined();
    expect(outbox[0].rev).toBe(2);
    expect(await getFotoPendiente(id)).toBeDefined();
  });

  it("fija foto_path al guardar con foto y los guardados posteriores la heredan", async () => {
    setOnline(false);
    const { id } = await saveReport(reporteVacio(7.96, -80.43), foto());
    const ruta = (await db.reportes.get(id))?.foto_path;
    expect(ruta).toMatch(new RegExp(`^${id}/[0-9a-f-]{36}\\.jpg$`));

    // Reedición con el formulario abierto antes del guardado anterior (foto_path null).
    await saveReport({ ...reporteVacio(7.96, -80.43), id, foto_path: null, menores: 1 });
    expect((await entradas())[0].payload?.foto_path).toBe(ruta);

    setOnline(true);
    await syncNow();
    expect(fake.state.uploads.map((u) => u.path)).toEqual([ruta]);
    expect(fake.state.rows.get(id)?.foto_path).toBe(ruta);
    expect((await db.reportes.get(id))?.foto_path).toBe(ruta);
  });
});

describe("push", () => {
  it("con red confirma con el servidor, marca synced y vacía el outbox", async () => {
    const { id, status } = await saveReport({ ...reporteVacio(7.96, -80.43), adultos: 2 });
    expect(status).toBe("synced");
    expect(await db.outbox.count()).toBe(0);
    const r = await db.reportes.get(id);
    expect(r?._sync).toBe("synced");
    expect(r?.created_by).toBe("user-1");
    expect(fake.state.rows.has(id)).toBe(true);
    const body = fake.state.upsertBodies[0];
    expect(body).not.toHaveProperty("total_personas");
    expect(body).not.toHaveProperty("created_by");
    expect(body).not.toHaveProperty("updated_by");
    expect(getEngineState().lastError).toBeUndefined();
    expect((await db.meta.get("lastSyncAt"))?.value).toBeTruthy();
  });

  it("sube la foto antes del upsert y guarda foto_path", async () => {
    const { id, status } = await saveReport(reporteVacio(7.96, -80.43), foto());
    expect(status).toBe("synced");
    const i = fake.state.calls.findIndex((c) => c.startsWith("upload:"));
    const j = fake.state.calls.indexOf(`upsert:${id}`);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(i).toBeLessThan(j);
    const subida = fake.state.uploads[0];
    expect(subida.path).toMatch(new RegExp(`^${id}/.+\\.jpg$`));
    expect(subida.options).toEqual({ contentType: "image/jpeg", upsert: false });
    expect(fake.state.rows.get(id)?.foto_path).toBe(subida.path);
    expect((await db.reportes.get(id))?.foto_path).toBe(subida.path);
    expect(await getFotoPendiente(id)).toBeUndefined();
  });

  it("si la foto ya existía (reintento) cuenta como subida", async () => {
    fake.state.uploadError = { message: "The resource already exists", status: 409, statusCode: "409" };
    const { status } = await saveReport(reporteVacio(7.96, -80.43), foto());
    expect(status).toBe("synced");
  });

  it("si falla la subida de la foto no se envía el upsert", async () => {
    fake.state.uploadError = errorRed();
    const { id, status } = await saveReport(reporteVacio(7.96, -80.43), foto());
    expect(status).toBe("pending");
    expect(fake.state.calls).not.toContain(`upsert:${id}`);
    expect(await getFotoPendiente(id)).toBeDefined();
  });

  it("un error de red deja el reporte pendiente e incrementa los intentos", async () => {
    fake.state.upsertError = errorRed();
    const { id, status } = await saveReport(reporteVacio(7.96, -80.43));
    expect(status).toBe("pending");
    expect((await db.reportes.get(id))?._sync).toBe("pending");
    const [e] = await entradas();
    expect(e.intentos).toBe(1);
    expect(e.lastError).toContain("Failed to fetch");
    expect(e.fatal).toBe(false);
  });

  it("un error 4xx (RLS/validación) marca el reporte con error y no lo pierde", async () => {
    fake.state.upsertError = {
      message: 'new row violates row-level security policy for table "reportes"',
      code: "42501",
      status: 403,
    };
    const { id, status } = await saveReport(reporteVacio(7.96, -80.43));
    expect(status).toBe("pending");
    expect((await db.reportes.get(id))?._sync).toBe("error");
    const [e] = await entradas();
    expect(e.fatal).toBe(true);
    expect(e.intentos).toBe(1);
    expect(getEngineState().lastError).toContain("row-level security");

    // Un reintento manual que funciona lo deja sincronizado.
    const r = await syncNow();
    expect(r.subidos).toBe(1);
    expect((await db.reportes.get(id))?._sync).toBe("synced");
  });

  it("un rechazo RLS (42501) es fatal: marca error, sigue con la siguiente entrada y hace pull", async () => {
    setOnline(false);
    await saveReport({ ...reporteVacio(7.96, -80.43), id: ID_A, adultos: 1 });
    await saveReport({ ...reporteVacio(7.96, -80.43), id: ID_B, adultos: 2 });
    // Otro reporte en el servidor: solo llega al celular si la pasada hace pull.
    fake.state.rows.set(ID_C, filaRemota({ id: ID_C, adultos: 5 }));
    // Como postgrest-js real: el status va en la respuesta, no dentro de `error`.
    fake.state.upsertErrorPorId.set(ID_A, {
      message: 'new row violates row-level security policy for table "reportes"',
      code: "42501",
      status: 403,
    });

    setOnline(true);
    const r = await syncNow();
    expect(r.subidos).toBe(1);
    expect(r.error).toContain("rechazó");
    expect((await db.reportes.get(ID_A))?._sync).toBe("error");
    const [e] = await entradas();
    expect(e).toMatchObject({ reporteId: ID_A, fatal: true, intentos: 1 });
    expect((await db.reportes.get(ID_B))?._sync).toBe("synced");
    expect(fake.state.calls).toContain("select");
    expect((await db.reportes.get(ID_C))?.adultos).toBe(5);
    expect(getEngineState().lastError).toContain("row-level security");

    // Un disparador automático no lo reintenta (no es un fallo de red).
    const llamadas = fake.state.calls.length;
    await ejecutarSync(false);
    expect(fake.state.calls.slice(llamadas)).not.toContain(`upsert:${ID_A}`);
  });

  it("un check (23514) sin status también es fatal", async () => {
    fake.state.upsertError = { message: 'violates check constraint "reportes_adultos_check"', code: "23514", status: 400 };
    const { id } = await saveReport(reporteVacio(7.96, -80.43));
    expect((await db.reportes.get(id))?._sync).toBe("error");
    expect((await entradas())[0].fatal).toBe(true);
  });

  it("no envía updated_at (lo fija el servidor) pero sí created_at", async () => {
    await saveReport(reporteVacio(7.96, -80.43));
    const body = fake.state.upsertBodies[0];
    expect(body).not.toHaveProperty("updated_at");
    expect(body).toHaveProperty("created_at");
  });

  it("sin sesión no envía ni borra nada y avisa", async () => {
    fake.state.session = null;
    await db.reportes.put(local(ID_C));
    const { id, status } = await saveReport(reporteVacio(7.96, -80.43));
    expect(status).toBe("pending");
    expect(await db.outbox.count()).toBe(1);
    expect(await db.reportes.get(ID_C)).toBeDefined();
    expect((await db.reportes.get(id))?._sync).toBe("pending");
    expect(getEngineState().lastError).toBe(MSG_SESION);
    expect(fake.state.calls).toEqual([]);
  });

  it("una sesión vencida (JWT) detiene la pasada y conserva la cola", async () => {
    fake.state.upsertError = { message: "JWT expired", code: "PGRST303", status: 401 };
    const { status } = await saveReport(reporteVacio(7.96, -80.43));
    expect(status).toBe("pending");
    const [e] = await entradas();
    expect(e.intentos).toBe(0);
    expect(getEngineState().lastError).toBe(MSG_SESION);
  });
});

describe("clasificarError", () => {
  it("clasifica por SQLSTATE, código PGRST y status HTTP", () => {
    const pg = (code: string, message = "x") => ({ message, code, details: "", hint: "" });
    expect(clasificarError(pg("42501"))).toBe("fatal");
    expect(clasificarError(pg("23503"))).toBe("fatal");
    expect(clasificarError(pg("22P02"))).toBe("fatal");
    expect(clasificarError(pg("PGRST204"))).toBe("fatal");
    expect(clasificarError(pg("PGRST116"))).toBe("fatal");
    expect(clasificarError(pg("PGRST301"))).toBe("auth");
    expect(clasificarError(pg("", "JWT expired"))).toBe("auth");
    expect(clasificarError(conStatus(pg("42501"), 401))).toBe("auth");
    expect(clasificarError(conStatus(pg(""), 401))).toBe("auth");
    expect(clasificarError(conStatus(pg("", "TypeError: Failed to fetch"), 0))).toBe("network");
    expect(clasificarError(new TypeError("Load failed"))).toBe("network");
    expect(clasificarError(conStatus(pg(""), 503))).toBe("network");
    expect(clasificarError(conStatus(pg(""), 429))).toBe("network");
    expect(clasificarError(conStatus(pg(""), 408))).toBe("network");
    expect(clasificarError(conStatus(pg(""), 404))).toBe("fatal");
  });

  it("sin señal todo es de red", () => {
    setOnline(false);
    expect(clasificarError({ message: "x", code: "42501" })).toBe("network");
  });
});

describe("pull y reconciliación", () => {
  it("no pisa pendientes y borra solo los synced que ya no existen", async () => {
    setOnline(false);
    // A: pendiente local (en la cola) con datos nuevos; en el servidor hay una versión vieja.
    await saveReport({ ...reporteVacio(7.96, -80.43), id: ID_A, adultos: 9 });
    // C: synced local que ya no está en el servidor → se borra.
    await db.reportes.put(local(ID_C));
    // D: con error local, sin estar en el servidor → se conserva.
    await db.reportes.put(local(ID_D, { _sync: "error" }));
    await db.outbox.add({
      reporteId: ID_D,
      op: "upsert",
      payload: filaRemota({ id: ID_D }),
      intentos: 1,
      createdAt: new Date().toISOString(),
    } as never);

    await reconciliar([filaRemota({ id: ID_A, adultos: 1 }), filaRemota({ id: ID_B, adultos: 3 })]);

    expect((await db.reportes.get(ID_A))?.adultos).toBe(9);
    expect((await db.reportes.get(ID_A))?._sync).toBe("pending");
    expect((await db.reportes.get(ID_B))?._sync).toBe("synced");
    expect(await db.reportes.get(ID_C)).toBeUndefined();
    expect(await db.reportes.get(ID_D)).toBeDefined();
  });

  it("no retrocede un synced local más nuevo que el descargado", async () => {
    await db.reportes.put(local(ID_A, { adultos: 7, updated_at: "2026-10-05T00:00:00.000Z" }));
    await reconciliar([filaRemota({ id: ID_A, adultos: 1, updated_at: "2026-10-04T00:00:00.000Z" })]);
    expect((await db.reportes.get(ID_A))?.adultos).toBe(7);
    await reconciliar([filaRemota({ id: ID_A, adultos: 2, updated_at: "2026-10-06T00:00:00.000Z" })]);
    expect((await db.reportes.get(ID_A))?.adultos).toBe(2);
  });

  it("syncNow descarga los reportes del servidor", async () => {
    fake.state.rows.set(ID_B, filaRemota({ id: ID_B, adultos: 3 }));
    const r = await syncNow();
    expect(r.error).toBeUndefined();
    expect((await db.reportes.get(ID_B))?.adultos).toBe(3);
  });

  it("Realtime respeta los pendientes locales", async () => {
    setOnline(false);
    await saveReport({ ...reporteVacio(7.96, -80.43), id: ID_A, adultos: 9 });
    const base = { schema: "public", table: "reportes", commit_timestamp: "", errors: [] };
    await aplicarCambioRealtime({ ...base, eventType: "UPDATE", new: filaRemota({ id: ID_A, adultos: 1 }), old: {} });
    await aplicarCambioRealtime({ ...base, eventType: "INSERT", new: filaRemota({ id: ID_B }), old: {} });
    await aplicarCambioRealtime({ ...base, eventType: "DELETE", new: {}, old: { id: ID_A } as Partial<Reporte> });
    expect((await db.reportes.get(ID_A))?.adultos).toBe(9);
    expect((await db.reportes.get(ID_B))?._sync).toBe("synced");
    await aplicarCambioRealtime({ ...base, eventType: "DELETE", new: {}, old: { id: ID_B } as Partial<Reporte> });
    expect(await db.reportes.get(ID_B)).toBeUndefined();
  });
});

describe("deleteReport", () => {
  it("sin red lanza un error claro", async () => {
    setOnline(false);
    await expect(deleteReport(ID_A)).rejects.toThrow(MSG_BORRAR_SIN_RED);
  });

  it("si el servidor no borra ninguna fila avisa que solo un admin puede", async () => {
    fake.state.rows.set(ID_A, filaRemota({ id: ID_A }));
    fake.state.deleteBloqueado = true;
    await db.reportes.put(local(ID_A));
    await expect(deleteReport(ID_A)).rejects.toThrow(MSG_BORRAR_SOLO_ADMIN);
    expect(await db.reportes.get(ID_A)).toBeDefined();
  });

  it("con un upsert pendiente, el borrado es exclusivo: el upsert no se envía después del DELETE", async () => {
    fake.state.rows.set(ID_A, filaRemota({ id: ID_A }));
    setOnline(false);
    await saveReport({ ...reporteVacio(7.96, -80.43), id: ID_A, adultos: 3 });
    expect(await db.outbox.count()).toBe(1);
    setOnline(true);

    // Un disparador (60 s / online / visibilitychange) llega con el DELETE ya
    // aplicado en el servidor y la respuesta aún en camino.
    let pasada: Promise<unknown> | undefined;
    fake.state.despuesDeBorrar = async () => {
      fake.state.despuesDeBorrar = null;
      pasada = ejecutarSync(false);
      await new Promise((r) => setTimeout(r, 30));
    };
    await deleteReport(ID_A);
    await pasada;
    await esperarSync();

    const iDelete = fake.state.calls.indexOf(`delete:${ID_A}`);
    expect(iDelete).toBeGreaterThanOrEqual(0);
    expect(fake.state.calls.slice(iDelete)).not.toContain(`upsert:${ID_A}`);
    expect(fake.state.rows.has(ID_A)).toBe(false);
    expect(await db.reportes.get(ID_A)).toBeUndefined();
    expect(await db.outbox.count()).toBe(0);
  });

  it("si el DELETE falla, devuelve a la cola los cambios pendientes", async () => {
    fake.state.rows.set(ID_A, filaRemota({ id: ID_A }));
    setOnline(false);
    await saveReport({ ...reporteVacio(7.96, -80.43), id: ID_A, adultos: 3 });
    setOnline(true);
    fake.state.deleteError = { message: "permission denied for table reportes", code: "42501", status: 403 };
    await expect(deleteReport(ID_A)).rejects.toThrow("No se pudo borrar el reporte");
    const [e] = await entradas();
    expect(e).toMatchObject({ reporteId: ID_A, op: "upsert" });
    expect(e.payload?.adultos).toBe(3);
    expect(await db.reportes.get(ID_A)).toBeDefined();
  });

  it("borra en el servidor, en Dexie, en la cola y la foto", async () => {
    fake.state.rows.set(ID_A, filaRemota({ id: ID_A, foto_path: `${ID_A}/f.jpg` }));
    await db.reportes.put(local(ID_A, { foto_path: `${ID_A}/f.jpg` }));
    await deleteReport(ID_A);
    expect(fake.state.rows.has(ID_A)).toBe(false);
    expect(await db.reportes.get(ID_A)).toBeUndefined();
    expect(await db.outbox.where("reporteId").equals(ID_A).count()).toBe(0);
    expect(fake.state.removed).toEqual([`${ID_A}/f.jpg`]);
  });
});

describe("limpiarEspejoLocal (cerrar sesión)", () => {
  it("borra los synced y conserva la cola y los pendientes o con error", async () => {
    await db.reportes.put(local(ID_A));
    await db.reportes.put(local(ID_B, { _sync: "error" }));
    await db.outbox.add({
      reporteId: ID_B,
      op: "upsert",
      payload: filaRemota({ id: ID_B }),
      intentos: 1,
      createdAt: new Date().toISOString(),
    } as never);
    setOnline(false);
    const { id: pendiente } = await saveReport(reporteVacio(7.96, -80.43));
    // Synced pero con una entrada en la cola (raro, pero no se debe perder).
    await db.reportes.put(local(ID_C));
    await db.outbox.add({
      reporteId: ID_C,
      op: "upsert",
      payload: filaRemota({ id: ID_C }),
      intentos: 0,
      createdAt: new Date().toISOString(),
    } as never);
    await db.meta.put({ key: META_ULTIMO_BRIGADISTA, value: "Otra persona" });
    await db.meta.put({ key: "lastSyncAt", value: new Date().toISOString() });
    await db.meta.put({ key: "perfil", value: "se borra aparte" });

    expect(await limpiarEspejoLocal()).toBe(1);
    expect(await db.reportes.get(ID_A)).toBeUndefined();
    expect(await db.reportes.get(ID_B)).toBeDefined();
    expect(await db.reportes.get(ID_C)).toBeDefined();
    expect((await db.reportes.get(pendiente))?._sync).toBe("pending");
    expect(await db.outbox.count()).toBe(3);
    expect(await db.meta.get(META_ULTIMO_BRIGADISTA)).toBeUndefined();
    expect(await db.meta.get("lastSyncAt")).toBeUndefined();
    expect(await db.meta.get("perfil")).toBeDefined();
  });
});

describe("getFotoUrl", () => {
  it("usa la foto pendiente, luego la firma de Storage y por último foto_url", async () => {
    const crear = vi.fn(() => "blob:local");
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: crear });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });

    setOnline(false);
    const { id } = await saveReport(reporteVacio(7.96, -80.43), foto());
    const r = (await db.reportes.get(id))!;
    crear.mockClear(); // saveReport ya creó la URL de previsualización.
    expect(await getFotoUrl(r)).toBe("blob:local");
    expect(await getFotoUrl(r)).toBe("blob:local");
    expect(crear).toHaveBeenCalledTimes(1);

    const firmada = await getFotoUrl({ id: ID_B, foto_path: `${ID_B}/x.jpg`, foto_url: null });
    expect(firmada).toBe(`https://firmada.test/${ID_B}/x.jpg?exp=3600`);
    await getFotoUrl({ id: ID_B, foto_path: `${ID_B}/x.jpg`, foto_url: null });
    expect(fake.state.calls.filter((c) => c.startsWith("sign:"))).toHaveLength(1);

    expect(await getFotoUrl({ id: ID_C, foto_path: null, foto_url: "https://drive.test/f" })).toBe(
      "https://drive.test/f",
    );
    expect(await getFotoUrl({ id: ID_D, foto_path: null, foto_url: null })).toBeNull();
  });
});

describe("uuid", () => {
  it("genera UUID v4 aunque no exista crypto.randomUUID (http sin TLS)", () => {
    const original = crypto.randomUUID;
    Object.defineProperty(crypto, "randomUUID", { configurable: true, value: undefined });
    try {
      const v = uuid();
      expect(v).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(uuid()).not.toBe(v);
    } finally {
      Object.defineProperty(crypto, "randomUUID", { configurable: true, value: original });
    }
  });
});

describe("fecha_reporte", () => {
  it("saveReport la guarda y la envía al servidor", async () => {
    const { id, status } = await saveReport({ ...reporteVacio(7.96, -80.43), fecha_reporte: "2026-10-10" });
    expect(status).toBe("synced");
    expect(fake.state.upsertBodies[0]).toMatchObject({ id, fecha_reporte: "2026-10-10" });
    expect((await db.reportes.get(id))?.fecha_reporte).toBe("2026-10-10");
  });

  it("rechaza una fecha futura sin tocar la base", async () => {
    await expect(saveReport({ ...reporteVacio(7.96, -80.43), fecha_reporte: "2999-01-01" })).rejects.toThrow();
    expect(await db.reportes.count()).toBe(0);
  });

  it("una fila del servidor sin fecha_reporte (sin migración 003) toma la de created_at", async () => {
    const fila = filaRemota({ id: ID_A, created_at: "2026-10-15T02:00:00.000Z" }) as Partial<Reporte>;
    delete fila.fecha_reporte;
    fake.state.rows.set(ID_A, fila as Reporte);
    await syncNow();
    expect((await db.reportes.get(ID_A))?.fecha_reporte).toBe("2026-10-14");
  });
});

describe("Dexie v2", () => {
  it("la migración desde v1 rellena fecha_reporte en reportes y en la cola, y crea visitas", async () => {
    const nombre = `brigada-v1-${uuid()}`;
    const v1 = new Dexie(nombre);
    v1.version(1).stores({ reportes: "id, estado, updated_at, _sync", outbox: "++seq, reporteId", meta: "key" });
    const sinFecha = { ...local(ID_A), created_at: "2026-10-15T02:00:00.000Z" } as Partial<ReporteLocal>;
    delete sinFecha.fecha_reporte;
    await v1.table("reportes").put(sinFecha);
    await v1.table("reportes").put(local(ID_B, { fecha_reporte: "2026-10-01" }));
    const payload = { ...sinFecha, created_at: "2026-10-16T12:00:00.000Z" };
    await v1.table("outbox").add({ reporteId: ID_A, op: "upsert", payload, intentos: 0, createdAt: "x" });
    v1.close();

    const v2 = new BrigadaDB(nombre);
    expect((await v2.reportes.get(ID_A))?.fecha_reporte).toBe("2026-10-14");
    expect((await v2.reportes.get(ID_B))?.fecha_reporte).toBe("2026-10-01");
    expect((await v2.outbox.toArray())[0].payload?.fecha_reporte).toBe("2026-10-16");
    expect(await v2.visitas.count()).toBe(0);
    await v2.delete();
  });
});

describe("saveVisita", () => {
  const AYER = () => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 1);
    return hoyPanama(d);
  };

  it("guarda la visita pendiente y deja el reporte ATENDIDO con la última entrega, encolado", async () => {
    setOnline(false);
    const { id: reporteId } = await saveReport({ ...reporteVacio(7.96, -80.43), nec_agua: true });
    const { id, status } = await saveVisita({
      ...visitaVacia(reporteId, { brigadista: " Ana " }),
      ent_agua: true,
      ent_otros: ["Ropa"],
      observaciones: " Entregado ",
    });
    expect(status).toBe("pending");

    const v = await db.visitas.get(id);
    expect(v).toMatchObject({
      reporte_id: reporteId,
      fecha: hoyPanama(),
      brigadista_texto: "Ana",
      ent_agua: true,
      ent_lona: false,
      ent_otros: ["Ropa"],
      observaciones: "Entregado",
      _sync: "pending",
    });
    const r = await db.reportes.get(reporteId);
    expect(r).toMatchObject({
      estado: "ATENDIDO",
      attended_at: v?.visitado_at,
      ent_agua: true,
      ent_otros: ["Ropa"],
      observaciones_atencion: "Entregado",
      nec_agua: true,
      _sync: "pending",
    });
    // Un solo upsert del reporte (colapsado); la visita aún no se encola (TODO sync-visitas).
    const cola = await entradas();
    expect(cola).toHaveLength(1);
    expect(cola[0].payload).toMatchObject({ estado: "ATENDIDO", ent_agua: true });
  });

  it("con fecha pasada: visitado_at y attended_at caen en esa fecha (Panamá)", async () => {
    setOnline(false);
    const { id: reporteId } = await saveReport(reporteVacio(7.96, -80.43));
    const { id } = await saveVisita({ ...visitaVacia(reporteId), fecha: AYER(), ent_lona: true });
    const v = await db.visitas.get(id);
    expect(fechaPanama(v!.visitado_at)).toBe(AYER());
    expect((await db.reportes.get(reporteId))?.attended_at).toBe(v?.visitado_at);
  });

  it("una visita anterior a la última atención no retrocede el reporte", async () => {
    setOnline(false);
    const { id: reporteId } = await saveReport(reporteVacio(7.96, -80.43));
    await saveVisita({ ...visitaVacia(reporteId), ent_agua: true });
    const antes = await db.reportes.get(reporteId);
    await saveVisita({ ...visitaVacia(reporteId), fecha: AYER(), ent_lona: true });
    const despues = await db.reportes.get(reporteId);
    expect(despues?.attended_at).toBe(antes?.attended_at);
    expect(despues?.ent_lona).toBe(false);
    expect(await db.visitas.where("reporte_id").equals(reporteId).count()).toBe(2);
  });

  it("valida: sin entregas, fecha futura o reporte inexistente no escriben nada", async () => {
    setOnline(false);
    const { id: reporteId } = await saveReport(reporteVacio(7.96, -80.43));
    await expect(saveVisita(visitaVacia(reporteId))).rejects.toThrow();
    await expect(saveVisita({ ...visitaVacia(reporteId), fecha: "2999-01-01", ent_agua: true })).rejects.toThrow();
    await expect(saveVisita({ ...visitaVacia(ID_D), ent_agua: true })).rejects.toThrow(MSG_VISITA_SIN_REPORTE);
    expect(await db.visitas.count()).toBe(0);
    expect((await db.reportes.get(reporteId))?.estado).toBe("PENDIENTE");
  });

  it("con red sube el reporte; la visita sigue pendiente hasta que el motor la envíe", async () => {
    const { id: reporteId } = await saveReport(reporteVacio(7.96, -80.43));
    const { id, status } = await saveVisita({ ...visitaVacia(reporteId), ent_agua: true });
    expect(status).toBe("pending");
    expect(fake.state.rows.get(reporteId)?.estado).toBe("ATENDIDO");
    expect((await db.visitas.get(id))?._sync).toBe("pending");
  });
});

describe("outbox con entradas de visita", () => {
  function entradaVisita(reporteId: string): Omit<OutboxEntry, "seq"> {
    return {
      entidad: "visita",
      reporteId,
      op: "upsert",
      payload: null,
      visitaId: ID_D,
      visitaPayload: null,
      intentos: 0,
      createdAt: new Date().toISOString(),
    };
  }

  it("el motor actual las deja intactas y no impide marcar synced el reporte", async () => {
    setOnline(false);
    await saveReport({ ...reporteVacio(7.96, -80.43), id: ID_A });
    await db.outbox.add(entradaVisita(ID_A) as OutboxEntry);
    setOnline(true);
    const r = await syncNow();
    expect(r.error).toBeUndefined();
    expect(fake.state.calls.filter((c) => c.startsWith("upsert:"))).toEqual([`upsert:${ID_A}`]);
    const cola = await entradas();
    expect(cola).toHaveLength(1);
    expect(cola[0]).toMatchObject({ entidad: "visita", reporteId: ID_A, intentos: 0 });
    expect((await db.reportes.get(ID_A))?._sync).toBe("synced");
  });

  it("un upsert de reporte no colapsa con una entrada de visita", async () => {
    setOnline(false);
    await db.outbox.add(entradaVisita(ID_A) as OutboxEntry);
    await saveReport({ ...reporteVacio(7.96, -80.43), id: ID_A });
    const cola = await entradas();
    expect(cola.map((e) => e.entidad ?? "reporte")).toEqual(["visita", "reporte"]);
  });

  it("deleteReport borra también las visitas locales y sus entradas", async () => {
    fake.state.rows.set(ID_A, filaRemota({ id: ID_A }));
    await db.reportes.put(local(ID_A));
    const visita: VisitaLocal = {
      ...visitaVacia(ID_A),
      id: ID_D,
      ent_agua: true,
      visitado_at: new Date().toISOString(),
      brigadista_texto: null,
      observaciones: null,
      created_at: new Date().toISOString(),
      created_by: null,
      _sync: "synced",
    };
    await db.visitas.put(visita);
    await db.outbox.add(entradaVisita(ID_A) as OutboxEntry);
    await deleteReport(ID_A);
    expect(await db.visitas.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
  });
});
