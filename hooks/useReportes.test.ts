import { describe, expect, it } from "vitest";
import { filtrarReportes } from "@/hooks/useReportes";
import { encodePlusCode } from "@/lib/pluscode";
import type { ReporteLocal } from "@/lib/db";
import { reporteVacio } from "@/lib/types";

let n = 0;
function reporte(over: Partial<ReporteLocal>): ReporteLocal {
  n += 1;
  return {
    ...reporteVacio(7.96, -80.43),
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z",
    attended_at: null,
    club_id: null,
    created_by: null,
    updated_by: null,
    total_personas: 0,
    _sync: "synced",
    ...over,
  } as ReporteLocal;
}

const A = reporte({ estado: "PENDIENTE", prioridad: "ALTA", nec_agua: true, club_id: "c1", contacto_nombre: "Familia Pérez" });
const B = reporte({ estado: "ATENDIDO", attended_at: "2026-10-02T00:00:00.000Z", prioridad: "MEDIA", club_id: "c2" });
const C = reporte({ estado: "PENDIENTE", prioridad: "BAJA", nec_lona: true, contacto_telefono: "6968-0515", plus_code: "66VXXH6G+M5" });
const D = reporte({ estado: "PENDIENTE", prioridad: "MEDIA", nec_otros: ["Pañales Bebé"] });
const TODOS = [A, B, C];

describe("filtrarReportes", () => {
  it("sin filtros devuelve todo (copia, mismo orden)", () => {
    const r = filtrarReportes(TODOS);
    expect(r).toEqual(TODOS);
    expect(r).not.toBe(TODOS);
    expect(filtrarReportes(TODOS, {})).toEqual(TODOS);
  });

  it("filtra por estado y por prioridad (O dentro del filtro)", () => {
    expect(filtrarReportes(TODOS, { estado: ["PENDIENTE"] })).toEqual([A, C]);
    expect(filtrarReportes(TODOS, { prioridad: ["ALTA", "BAJA"] })).toEqual([A, C]);
    expect(filtrarReportes(TODOS, { estado: [] })).toEqual(TODOS);
  });

  it("filtra por vigencia respecto a `ahora` (y sigue funcionando por estado)", () => {
    const ahora = new Date("2026-10-19T15:00:00.000Z");
    const reciente = reporte({ estado: "ATENDIDO", attended_at: "2026-10-17T15:00:00.000Z" });
    const porVencer = reporte({ estado: "ATENDIDO", attended_at: "2026-10-14T15:00:00.000Z" });
    const vencido = reporte({ estado: "ATENDIDO", attended_at: "2026-10-12T15:00:00.000Z" });
    const lista = [A, reciente, porVencer, vencido];
    expect(filtrarReportes(lista, { vigencia: ["pendiente"] }, ahora)).toEqual([A]);
    expect(filtrarReportes(lista, { vigencia: ["reciente"] }, ahora)).toEqual([reciente]);
    expect(filtrarReportes(lista, { vigencia: ["por-vencer", "vencido"] }, ahora)).toEqual([porVencer, vencido]);
    expect(filtrarReportes(lista, { vigencia: [] }, ahora)).toEqual(lista);
    expect(filtrarReportes(lista, { estado: ["ATENDIDO"] }, ahora)).toEqual([reciente, porVencer, vencido]);
    // Al pasar el tiempo, el reciente pasa a por vencer.
    expect(filtrarReportes(lista, { vigencia: ["por-vencer"] }, new Date("2026-10-21T15:00:00.000Z"))).toEqual([
      reciente,
    ]);
  });

  it("filtra por necesidad", () => {
    expect(filtrarReportes(TODOS, { necesidades: ["agua"] })).toEqual([A]);
    expect(filtrarReportes(TODOS, { necesidades: ["agua", "lona"] })).toEqual([A, C]);
    expect(filtrarReportes(TODOS, { necesidades: ["colchonetas"] })).toEqual([]);
  });

  it('"otros" coincide con cualquier elemento en nec_otros', () => {
    const conOtros = [...TODOS, D];
    expect(filtrarReportes(conOtros, { necesidades: ["otros"] })).toEqual([D]);
    expect(filtrarReportes(conOtros, { necesidades: ["agua", "otros"] })).toEqual([A, D]);
  });

  it("filtra por club", () => {
    expect(filtrarReportes(TODOS, { clubId: ["c2"] })).toEqual([B]);
  });

  it("combina filtros (Y entre filtros)", () => {
    expect(filtrarReportes(TODOS, { estado: ["PENDIENTE"], prioridad: ["BAJA"] })).toEqual([C]);
    expect(filtrarReportes(TODOS, { estado: ["ATENDIDO"], necesidades: ["agua"] })).toEqual([]);
  });

  it("busca texto sin tildes ni mayúsculas en contacto, teléfono y Plus Code", () => {
    expect(filtrarReportes(TODOS, { texto: "perez" })).toEqual([A]);
    expect(filtrarReportes(TODOS, { texto: "6968" })).toEqual([C]);
    expect(filtrarReportes(TODOS, { texto: "xh6g" })).toEqual([C]);
  });

  it("busca por la etiqueta de estado y por el valor crudo", () => {
    expect(filtrarReportes(TODOS, { texto: "pendiente" })).toEqual([A, C]);
    expect(filtrarReportes(TODOS, { texto: "Atendido" })).toEqual([B]);
    expect(filtrarReportes(TODOS, { texto: "ATENDIDO" })).toEqual([B]);
  });

  it("busca por el Plus Code calculado si el reporte no lo tiene guardado", () => {
    const sinCodigo = reporte({ plus_code: null, lat: 8.4, lng: -80.1 });
    const codigo = encodePlusCode(8.4, -80.1)!;
    expect(filtrarReportes([...TODOS, sinCodigo], { texto: codigo.slice(4) })).toEqual([sinCodigo]);
  });
});
