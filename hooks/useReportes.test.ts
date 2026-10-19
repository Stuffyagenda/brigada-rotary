import { describe, expect, it } from "vitest";
import { filtrarReportes } from "@/hooks/useReportes";
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

  it("filtra por necesidad", () => {
    expect(filtrarReportes(TODOS, { necesidades: ["agua"] })).toEqual([A]);
    expect(filtrarReportes(TODOS, { necesidades: ["agua", "lona"] })).toEqual([A, C]);
    expect(filtrarReportes(TODOS, { necesidades: ["colchonetas"] })).toEqual([]);
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
});
