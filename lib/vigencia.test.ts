import { describe, expect, it } from "vitest";
import {
  diasDesdeAtencion,
  diasEntre,
  esFechaFutura,
  esFechaValida,
  fechaPanama,
  formatearFechaLarga,
  hoyPanama,
  instanteEnFechaPanama,
  textoAtendidoHace,
  vigencia,
  VIGENCIA_LABEL,
  VIGENCIAS,
} from "@/lib/vigencia";

/** 19 oct 2026, 10:00 en Panamá (UTC−5). */
const AHORA = new Date("2026-10-19T15:00:00.000Z");
const DIA = 24 * 60 * 60 * 1000;

/** ATENDIDO hace `dias` días exactos (misma hora). */
function atendidoHace(dias: number) {
  return { estado: "ATENDIDO" as const, attended_at: new Date(AHORA.getTime() - dias * DIA).toISOString() };
}

describe("fechas en Panamá", () => {
  it("hoyPanama usa la zona de Panamá, no la del celular ni UTC", () => {
    expect(hoyPanama(AHORA)).toBe("2026-10-19");
    // 03:00 UTC del 19 = 22:00 del 18 en Panamá.
    expect(hoyPanama(new Date("2026-10-19T03:00:00Z"))).toBe("2026-10-18");
    expect(hoyPanama(new Date("2026-10-19T05:00:00Z"))).toBe("2026-10-19");
  });

  it("fechaPanama de un instante ISO", () => {
    expect(fechaPanama("2026-10-15T02:00:00Z")).toBe("2026-10-14");
    expect(fechaPanama("2026-10-15T12:00:00.123456+00:00")).toBe("2026-10-15");
    expect(() => fechaPanama("no es fecha")).toThrow(RangeError);
  });

  it("valida fechas YYYY-MM-DD reales", () => {
    expect(esFechaValida("2026-10-18")).toBe(true);
    expect(esFechaValida("2026-02-30")).toBe(false);
    expect(esFechaValida("18/10/2026")).toBe(false);
  });

  it("diasEntre y esFechaFutura", () => {
    expect(diasEntre("2026-10-12", "2026-10-19")).toBe(7);
    expect(diasEntre("2026-10-19", "2026-10-12")).toBe(-7);
    expect(esFechaFutura("2026-10-20", AHORA)).toBe(true);
    expect(esFechaFutura("2026-10-19", AHORA)).toBe(false);
  });

  it("instanteEnFechaPanama: hoy es ahora; otra fecha conserva la hora de Panamá", () => {
    expect(instanteEnFechaPanama("2026-10-19", AHORA)).toBe(AHORA.toISOString());
    expect(instanteEnFechaPanama("2026-10-17", new Date("2026-10-19T15:30:00.000Z"))).toBe("2026-10-17T15:30:00.000Z");
    // 22:00 del 18 en Panamá → 22:00 del 17 en Panamá = 03:00 UTC del 18.
    const noche = new Date("2026-10-19T03:00:00.000Z");
    expect(instanteEnFechaPanama("2026-10-17", noche)).toBe("2026-10-18T03:00:00.000Z");
    expect(fechaPanama(instanteEnFechaPanama("2026-10-17", noche))).toBe("2026-10-17");
  });

  it("formatearFechaLarga en es-PA", () => {
    expect(formatearFechaLarga("2026-10-18")).toBe("18 de octubre de 2026");
    expect(formatearFechaLarga("2026-01-05")).toBe("5 de enero de 2026");
  });
});

describe("diasDesdeAtencion", () => {
  it("null si no está atendido", () => {
    expect(diasDesdeAtencion({ estado: "PENDIENTE", attended_at: null }, AHORA)).toBeNull();
    expect(diasDesdeAtencion({ estado: "ATENDIDO", attended_at: null }, AHORA)).toBeNull();
  });

  it("cuenta días de calendario en Panamá, no horas", () => {
    // 23:59 del 18 en Panamá → 00:00 del 19: un día.
    const ahora = new Date("2026-10-19T05:00:00.000Z");
    expect(diasDesdeAtencion({ estado: "ATENDIDO", attended_at: "2026-10-19T04:59:00.000Z" }, ahora)).toBe(1);
    // Mismo día en Panamá aunque en UTC sea otro.
    expect(diasDesdeAtencion({ estado: "ATENDIDO", attended_at: "2026-10-19T00:30:00.000Z" }, new Date("2026-10-19T03:00:00Z"))).toBe(0);
    expect(diasDesdeAtencion(atendidoHace(5), AHORA)).toBe(5);
  });

  it("nunca negativo (reloj del celular adelantado)", () => {
    expect(diasDesdeAtencion(atendidoHace(-2), AHORA)).toBe(0);
  });
});

describe("vigencia", () => {
  it("PENDIENTE → pendiente", () => {
    expect(vigencia({ estado: "PENDIENTE", attended_at: null }, AHORA)).toBe("pendiente");
  });

  it("umbrales: 0–3 reciente, 4–6 por vencer, ≥ 7 vencido", () => {
    expect([0, 1, 2, 3].map((d) => vigencia(atendidoHace(d), AHORA))).toEqual(Array(4).fill("reciente"));
    expect([4, 5, 6].map((d) => vigencia(atendidoHace(d), AHORA))).toEqual(Array(3).fill("por-vencer"));
    expect([7, 8, 30].map((d) => vigencia(atendidoHace(d), AHORA))).toEqual(Array(3).fill("vencido"));
  });

  it("ATENDIDO sin attended_at cuenta como vencido", () => {
    expect(vigencia({ estado: "ATENDIDO", attended_at: null }, AHORA)).toBe("vencido");
  });

  it("etiquetas y orden", () => {
    expect(VIGENCIAS).toEqual(["pendiente", "reciente", "por-vencer", "vencido"]);
    expect(VIGENCIA_LABEL["por-vencer"]).toBe("4+ días");
    expect(VIGENCIA_LABEL.vencido).toBe("7+ días");
    expect(textoAtendidoHace(0)).toBe("Atendido hoy");
    expect(textoAtendidoHace(1)).toBe("Atendido ayer");
    expect(textoAtendidoHace(8)).toBe("Atendido hace 8 días");
  });
});
