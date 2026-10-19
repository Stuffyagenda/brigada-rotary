import { describe, expect, it } from "vitest";
import {
  CONDICIONES_MEDICAS,
  DANIO_VIVIENDA_LABEL,
  INSUMOS,
  OTROS_INSUMOS,
  reporteSchema,
  reporteVacio,
  totalPersonas,
} from "@/lib/types";

const ID = "5f0c7c1e-3b7a-4d1e-9a51-6f1f4f0f2a11";

describe("constantes", () => {
  it("listas iguales a las del formulario", () => {
    expect(INSUMOS.map((i) => i.necColumna)).toEqual([
      "nec_agua",
      "nec_kit_alimento",
      "nec_kit_higiene",
      "nec_lona",
      "nec_camping",
      "nec_toldas",
      "nec_colchonetas",
    ]);
    expect(OTROS_INSUMOS).toEqual(["Palets", "Pañales Bebé", "Pañales Adulto", "Frazadas", "Ropa"]);
    expect(CONDICIONES_MEDICAS).toEqual([
      "Insulina / Diabético",
      "Hipertenso",
      "Movilidad reducida",
      "Herida / Trauma",
      "Embarazada",
    ]);
    expect(DANIO_VIVIENDA_LABEL["TOTAL / INHABITABLE"]).toBe("Destrucción total / Inhabitable");
  });
});

describe("reporteSchema", () => {
  it("acepta un reporte nuevo por defecto", () => {
    expect(reporteSchema.safeParse({ ...reporteVacio(7.96, -80.43), id: ID }).success).toBe(true);
  });

  it("exige coherencia entre estado y attended_at", () => {
    const base = reporteVacio(7.96, -80.43);
    expect(reporteSchema.safeParse({ ...base, estado: "ATENDIDO" }).success).toBe(false);
    expect(reporteSchema.safeParse({ ...base, attended_at: "2026-10-19T00:00:00.000Z" }).success).toBe(false);
    expect(
      reporteSchema.safeParse({ ...base, estado: "ATENDIDO", attended_at: "2026-10-19T00:00:00.000Z" }).success,
    ).toBe(true);
  });

  it("rechaza valores fuera de los check del SQL", () => {
    const base = reporteVacio(7.96, -80.43);
    expect(reporteSchema.safeParse({ ...base, lat: 91 }).success).toBe(false);
    expect(reporteSchema.safeParse({ ...base, lng: -181 }).success).toBe(false);
    expect(reporteSchema.safeParse({ ...base, adultos: -1 }).success).toBe(false);
    expect(reporteSchema.safeParse({ ...base, menores: 1.5 }).success).toBe(false);
    expect(reporteSchema.safeParse({ ...base, prioridad: "URGENTE" }).success).toBe(false);
    expect(reporteSchema.safeParse({ ...base, danio_vivienda: "TOTAL" }).success).toBe(false);
    expect(reporteSchema.safeParse({ ...base, id: "no-es-uuid" }).success).toBe(false);
  });

  it("totalPersonas suma adultos, mayores y menores", () => {
    expect(totalPersonas({ adultos: 2, adultos_mayores: 1, menores: 3 })).toBe(6);
  });
});
