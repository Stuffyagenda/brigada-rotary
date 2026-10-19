import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { saveReport, syncNow } from "@/lib/sync";
import { reporteVacio } from "@/lib/types";

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe("saveReport (stub)", () => {
  it("guarda en Dexie como pendiente y encola un upsert", async () => {
    const { id, status } = await saveReport({ ...reporteVacio(7.96, -80.43), adultos: 2, menores: 3 });
    expect(status).toBe("pending");
    const local = await db.reportes.get(id);
    expect(local?._sync).toBe("pending");
    expect(local?.total_personas).toBe(5);
    expect(local?.created_at).toBeTruthy();
    const outbox = await db.outbox.toArray();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ reporteId: id, op: "upsert", intentos: 0 });
    expect(outbox[0].payload).not.toHaveProperty("total_personas");
  });

  it("conserva created_at al editar y fija attended_at al atender", async () => {
    const { id } = await saveReport(reporteVacio(7.96, -80.43));
    const antes = await db.reportes.get(id);
    await saveReport({ ...reporteVacio(7.96, -80.43), id, estado: "ATENDIDO" });
    const despues = await db.reportes.get(id);
    expect(despues?.created_at).toBe(antes?.created_at);
    expect(despues?.attended_at).toBeTruthy();
    expect(await db.outbox.count()).toBe(2);
  });

  it("rechaza datos inválidos", async () => {
    await expect(saveReport({ ...reporteVacio(7.96, -80.43), adultos: -1 })).rejects.toThrow();
    expect(await db.reportes.count()).toBe(0);
  });

  it("syncNow informa los pendientes", async () => {
    await saveReport(reporteVacio(7.96, -80.43));
    const r = await syncNow();
    expect(r.subidos).toBe(0);
    expect(r.pendientes).toBe(1);
  });
});
