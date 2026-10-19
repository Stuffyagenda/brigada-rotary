import { describe, expect, it } from "vitest";
import {
  aplicarReglasGuardado,
  calcularAttendedAt,
  casillasIniciales,
  entregasActivas,
  necesidadesActivas,
  seccionesVisibles,
} from "@/lib/report-rules";
import { reporteVacio } from "@/lib/types";

const AHORA = new Date("2026-10-19T12:00:00.000Z");

describe("attended_at", () => {
  it("se fija al pasar a ATENDIDO", () => {
    expect(calcularAttendedAt("ATENDIDO", null, AHORA)).toBe(AHORA.toISOString());
  });
  it("conserva la fecha previa si ya estaba atendido", () => {
    expect(calcularAttendedAt("ATENDIDO", "2026-10-01T00:00:00.000Z", AHORA)).toBe("2026-10-01T00:00:00.000Z");
  });
  it("se vacía en PENDIENTE", () => {
    expect(calcularAttendedAt("PENDIENTE", "2026-10-01T00:00:00.000Z", AHORA)).toBeNull();
  });
});

describe("secciones activas y visibles", () => {
  it("necesidades activas si PENDIENTE o con casilla", () => {
    expect(necesidadesActivas("PENDIENTE", false)).toBe(true);
    expect(necesidadesActivas("ATENDIDO", false)).toBe(false);
    expect(necesidadesActivas("ATENDIDO", true)).toBe(true);
  });
  it("entregas activas si ATENDIDO o con casilla", () => {
    expect(entregasActivas("ATENDIDO", false)).toBe(true);
    expect(entregasActivas("PENDIENTE", false)).toBe(false);
    expect(entregasActivas("PENDIENTE", true)).toBe(true);
  });
  it("PENDIENTE: necesidades siempre, entregas con casilla, casilla de entrega visible", () => {
    expect(seccionesVisibles("PENDIENTE", false, true)).toEqual({
      necesidades: true,
      entregas: false,
      casillaEntrega: true,
      casillaNecesidad: false,
    });
    expect(seccionesVisibles("PENDIENTE", true, false).entregas).toBe(true);
  });
  it("ATENDIDO: entregas siempre, necesidades con casilla, casilla de necesidad visible", () => {
    expect(seccionesVisibles("ATENDIDO", true, false)).toEqual({
      necesidades: false,
      entregas: true,
      casillaEntrega: false,
      casillaNecesidad: true,
    });
    expect(seccionesVisibles("ATENDIDO", false, true).necesidades).toBe(true);
  });
});

describe("casillasIniciales", () => {
  it("marca entrega/necesidad según lo guardado", () => {
    const r = { ...reporteVacio(8, -80), ent_otros: ["Ropa"], nec_lona: true };
    expect(casillasIniciales(r)).toEqual({ chkEntrega: true, chkNecesidad: true });
    expect(casillasIniciales(reporteVacio(8, -80))).toEqual({ chkEntrega: false, chkNecesidad: false });
  });
});

describe("aplicarReglasGuardado", () => {
  const base = {
    ...reporteVacio(7.96, -80.43),
    nec_agua: true,
    nec_otros: ["Ropa"],
    ent_lona: true,
    ent_otros: ["Palets"],
    observaciones_atencion: "  Se entregó lona  ",
    condiciones_medicas: ["Hipertenso"],
    brigadista_texto: "  Ana ",
    contacto_nombre: "   ",
  };

  it("PENDIENTE sin casilla de entrega: borra entregas y observaciones", () => {
    const r = aplicarReglasGuardado(base, { chkEntrega: false, chkNecesidad: false }, AHORA);
    expect(r.attended_at).toBeNull();
    expect(r.nec_agua).toBe(true);
    expect(r.nec_otros).toEqual(["Ropa"]);
    expect(r.ent_lona).toBe(false);
    expect(r.ent_otros).toEqual([]);
    expect(r.observaciones_atencion).toBeNull();
  });

  it("PENDIENTE con casilla de entrega: conserva entregas", () => {
    const r = aplicarReglasGuardado(base, { chkEntrega: true, chkNecesidad: false }, AHORA);
    expect(r.ent_lona).toBe(true);
    expect(r.observaciones_atencion).toBe("Se entregó lona");
  });

  it("ATENDIDO sin casilla de necesidad: borra necesidades y fija attended_at", () => {
    const r = aplicarReglasGuardado({ ...base, estado: "ATENDIDO" }, { chkEntrega: false, chkNecesidad: false }, AHORA);
    expect(r.attended_at).toBe(AHORA.toISOString());
    expect(r.nec_agua).toBe(false);
    expect(r.nec_otros).toEqual([]);
    expect(r.ent_lona).toBe(true);
  });

  it("condiciones médicas solo con casos_medicos ≥ 1", () => {
    expect(aplicarReglasGuardado(base, { chkEntrega: false, chkNecesidad: false }).condiciones_medicas).toEqual([]);
    expect(
      aplicarReglasGuardado({ ...base, casos_medicos: 1 }, { chkEntrega: false, chkNecesidad: false })
        .condiciones_medicas,
    ).toEqual(["Hipertenso"]);
  });

  it("recorta textos y convierte vacíos en null", () => {
    const r = aplicarReglasGuardado(base, { chkEntrega: false, chkNecesidad: false });
    expect(r.brigadista_texto).toBe("Ana");
    expect(r.contacto_nombre).toBeNull();
  });

  it("no modifica el objeto de entrada", () => {
    const copia = structuredClone(base);
    aplicarReglasGuardado(base, { chkEntrega: false, chkNecesidad: false });
    expect(base).toEqual(copia);
  });
});
