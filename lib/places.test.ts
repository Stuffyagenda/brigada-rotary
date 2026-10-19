import { describe, expect, it } from "vitest";
import { findLocalPlace, LOCAL_PANAMA_PLACES, normalizePlaceName } from "@/lib/places";

describe("places", () => {
  it("tiene las 36 comunidades", () => {
    expect(Object.keys(LOCAL_PANAMA_PLACES)).toHaveLength(36);
  });

  it("normaliza sin tildes y en mayúsculas", () => {
    expect(normalizePlaceName("  Penonomé ")).toBe("PENONOME");
  });

  it("encuentra con tildes y mayúsculas mezcladas", () => {
    expect(findLocalPlace("chitré")).toEqual({ name: "CHITRE", lat: 7.9625, lng: -80.4286 });
    expect(findLocalPlace("Río de Jesús")?.name).toBe("RIO DE JESUS");
  });

  it("coincide si el término contiene el nombre", () => {
    expect(findLocalPlace("barrio de Pesé")?.name).toBe("PESE");
  });

  it("devuelve null si no hay coincidencia o el término está vacío", () => {
    expect(findLocalPlace("Tokio")).toBeNull();
    expect(findLocalPlace("   ")).toBeNull();
  });
});
