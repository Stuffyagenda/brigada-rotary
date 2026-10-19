import { describe, expect, it } from "vitest";
import {
  CONDICIONES_MEDICAS,
  DANIO_VIVIENDA_LABEL,
  INSUMOS,
  OTROS_INSUMOS,
  MSG_VISITA_VACIA,
  reporteSchema,
  reporteVacio,
  totalPersonas,
  visitaSchema,
  visitaVacia,
} from "@/lib/types";
import { hoyPanama } from "@/lib/vigencia";

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

  it("fecha_reporte: por defecto hoy en Panamá, formato YYYY-MM-DD y no futura", () => {
    const base = reporteVacio(7.96, -80.43);
    expect(base.fecha_reporte).toBe(hoyPanama());
    expect(reporteVacio(7.96, -80.43, new Date("2026-10-19T03:00:00Z")).fecha_reporte).toBe("2026-10-18");
    expect(reporteSchema.safeParse({ ...base, fecha_reporte: "2026-10-01" }).success).toBe(true);
    expect(reporteSchema.safeParse({ ...base, fecha_reporte: "01/10/2026" }).success).toBe(false);
    expect(reporteSchema.safeParse({ ...base, fecha_reporte: undefined }).success).toBe(false);
    const futura = reporteSchema.safeParse({ ...base, fecha_reporte: "2999-01-01" });
    expect(futura.success).toBe(false);
    expect(futura.error?.issues[0]).toMatchObject({
      path: ["fecha_reporte"],
      message: "La fecha del reporte no puede ser futura.",
    });
  });

  it("totalPersonas suma adultos, mayores y menores", () => {
    expect(totalPersonas({ adultos: 2, adultos_mayores: 1, menores: 3 })).toBe(6);
  });
});

describe("visitaSchema", () => {
  const vacia = () => visitaVacia(ID, { brigadista: "Ana" });

  it("visitaVacia: hoy, sin entregas, con el brigadista indicado", () => {
    expect(vacia()).toMatchObject({ reporte_id: ID, fecha: hoyPanama(), brigadista_texto: "Ana", ent_otros: [] });
  });

  it("exige al menos una entrega u observación", () => {
    const r = visitaSchema.safeParse(vacia());
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]).toMatchObject({ path: ["entregas"], message: MSG_VISITA_VACIA });
    expect(visitaSchema.safeParse({ ...vacia(), observaciones: "   " }).success).toBe(false);
    expect(visitaSchema.safeParse({ ...vacia(), ent_lona: true }).success).toBe(true);
    expect(visitaSchema.safeParse({ ...vacia(), ent_otros: ["Ropa"] }).success).toBe(true);
    expect(visitaSchema.safeParse({ ...vacia(), observaciones: "Sin novedad" }).success).toBe(true);
  });

  it("fecha no futura y reporte_id uuid", () => {
    const ok = { ...vacia(), ent_agua: true };
    expect(visitaSchema.safeParse({ ...ok, fecha: "2026-10-01" }).success).toBe(true);
    const futura = visitaSchema.safeParse({ ...ok, fecha: "2999-01-01" });
    expect(futura.error?.issues[0]).toMatchObject({
      path: ["fecha"],
      message: "La fecha de la visita no puede ser futura.",
    });
    expect(visitaSchema.safeParse({ ...ok, reporte_id: "x" }).success).toBe(false);
  });
});
