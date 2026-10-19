import { describe, expect, it, vi } from "vitest";
import { geocode } from "@/lib/geocode";

function respuesta(data: unknown, ok = true): Response {
  return { ok, json: async () => data } as Response;
}

describe("geocode", () => {
  it("prioriza el Plus Code (zoom 17) y no llama a la red", async () => {
    const fetchImpl = vi.fn();
    const r = await geocode("66VXXH6G+M5", { online: true, fetchImpl });
    expect(r?.source).toBe("pluscode");
    expect(r?.zoom).toBe(17);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("usa las comunidades locales sin conexión (zoom 15)", async () => {
    const r = await geocode("Las Tablas", { online: false });
    expect(r).toMatchObject({ lat: 7.7667, lng: -80.2833, zoom: 15, source: "local" });
  });

  it("consulta Nominatim limitado a Panamá si hay conexión", async () => {
    const fetchImpl = vi.fn(async () => respuesta([{ lat: "8.98", lon: "-79.52", display_name: "Panamá" }]));
    const r = await geocode("Bella Vista", { online: true, fetchImpl });
    expect(r).toMatchObject({ lat: 8.98, lng: -79.52, source: "nominatim" });
    const url = String((fetchImpl.mock.calls[0] as unknown[])[0]);
    expect(url).toContain("countrycodes=pa");
    expect(url).toContain("q=Bella%20Vista");
  });

  it("devuelve null sin conexión si no es Plus Code ni lugar local", async () => {
    const fetchImpl = vi.fn();
    expect(await geocode("Bella Vista", { online: false, fetchImpl })).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("devuelve null si Nominatim falla o no encuentra nada", async () => {
    expect(await geocode("xyz", { online: true, fetchImpl: async () => respuesta([]) })).toBeNull();
    expect(
      await geocode("xyz", {
        online: true,
        fetchImpl: async () => {
          throw new TypeError("Failed to fetch");
        },
      }),
    ).toBeNull();
    expect(await geocode("xyz", { online: true, fetchImpl: async () => respuesta(null, false) })).toBeNull();
  });

  it("ignora el texto vacío", async () => {
    expect(await geocode("  ")).toBeNull();
  });

  it("no consulta Nominatim con teléfonos ni correos", async () => {
    const fetchImpl = vi.fn(async () => respuesta([{ lat: "8.98", lon: "-79.52" }]));
    expect(await geocode("6968-0515", { online: true, fetchImpl })).toBeNull();
    expect(await geocode("+507 6000 0001", { online: true, fetchImpl })).toBeNull();
    expect(await geocode("ana@correo.test", { online: true, fetchImpl })).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
    // Pocos dígitos (calle, casa) sí se buscan.
    await geocode("Calle 50", { online: true, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("no consulta Nominatim con nombres de contactos locales", async () => {
    const fetchImpl = vi.fn(async () => respuesta([{ lat: "8.98", lon: "-79.52" }]));
    const excluir = ["Familia Pérez", "Ana María Prueba", null, "Pedro"];
    expect(await geocode("perez", { online: true, fetchImpl, excluir })).toBeNull();
    expect(await geocode("Ana María Prueba", { online: true, fetchImpl, excluir })).toBeNull();
    expect(await geocode("ana prueba", { online: true, fetchImpl, excluir })).toBeNull();
    expect(await geocode("Familia Pérez Bella Vista", { online: true, fetchImpl, excluir })).toBeNull();
    expect(await geocode("Pedro", { online: true, fetchImpl, excluir })).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
    // Un nombre de una palabra no bloquea un lugar más largo.
    expect(await geocode("San Pedro", { online: true, fetchImpl, excluir })).not.toBeNull();
    expect(await geocode("Bella Vista", { online: true, fetchImpl, excluir })).not.toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("los Plus Codes y lugares locales se resuelven aunque coincidan con un contacto", async () => {
    const r = await geocode("Las Tablas", { online: true, excluir: ["Las Tablas"] });
    expect(r?.source).toBe("local");
  });
});
