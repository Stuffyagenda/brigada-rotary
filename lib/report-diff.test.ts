import { describe, expect, it } from "vitest";
import { MENSAJES_CONFIRMACION, mensajeConfirmacion, tipoDeCambio } from "@/lib/report-diff";
import { reporteVacio } from "@/lib/types";

const previo = {
  ...reporteVacio(7.9616, -80.4245),
  id: "5f0c7c1e-3b7a-4d1e-9a51-6f1f4f0f2a11",
  plus_code: "66VXXH6G+M5",
  nec_otros: ["Ropa", "Palets"],
  created_at: "2026-10-01T00:00:00.000Z",
  updated_at: "2026-10-02T00:00:00.000Z",
};

describe("tipoDeCambio", () => {
  it("nuevo si no hay reporte previo", () => {
    expect(tipoDeCambio(null, previo)).toBe("nuevo");
    expect(mensajeConfirmacion(undefined, previo)).toBe(
      "¿Estás seguro de que deseas guardar este nuevo reporte?",
    );
  });

  it("solo ubicación (el Plus Code derivado no cuenta como cambio de formulario)", () => {
    const nuevo = { ...previo, lat: 7.97, plus_code: "66VXXH9G+22" };
    expect(tipoDeCambio(previo, nuevo)).toBe("ubicacion");
    expect(mensajeConfirmacion(previo, nuevo)).toBe("¿Estás seguro de cambiar la ubicación de este registro?");
  });

  it("solo formulario", () => {
    expect(tipoDeCambio(previo, { ...previo, adultos: 3 })).toBe("formulario");
    expect(MENSAJES_CONFIRMACION.formulario).toBe("¿Estás seguro de realizar los cambios del formulario?");
  });

  it("ambos", () => {
    expect(tipoDeCambio(previo, { ...previo, lng: -80.5, nec_agua: true })).toBe("ambos");
    expect(MENSAJES_CONFIRMACION.ambos).toBe(
      "¿Estás seguro de cambiar la ubicación y realizar también los cambios del formulario?",
    );
  });

  it("sin cambios: ignora fechas automáticas, orden de chips y null/vacío", () => {
    const nuevo = {
      ...previo,
      updated_at: "2026-10-19T00:00:00.000Z",
      nec_otros: ["Palets", "Ropa"],
      contacto_nombre: "",
      lat: previo.lat + 0.00000001,
    };
    expect(tipoDeCambio(previo, nuevo)).toBe("sin-cambios");
    expect(mensajeConfirmacion(previo, nuevo)).toBe(
      "No se detectaron cambios en los datos. ¿Deseas guardar de todos modos?",
    );
  });

  it("una foto nueva cuenta como cambio del formulario", () => {
    expect(tipoDeCambio(previo, { ...previo }, { hayFotoNueva: true })).toBe("formulario");
  });

  it("ignora campos locales y de auditoría del reporte guardado", () => {
    const guardado = { ...previo, _sync: "pending", total_personas: 0, created_by: "x", updated_by: "y" };
    expect(tipoDeCambio(guardado, { ...previo })).toBe("sin-cambios");
  });
});
