/** Reportes FICTICIOS para tests (nunca datos reales). */
import type { ReporteLocal } from "@/lib/db";
import { reporteVacio, totalPersonas } from "@/lib/types";

let n = 0;

export function reporteFicticio(over: Partial<ReporteLocal> = {}): ReporteLocal {
  n += 1;
  const base = reporteVacio(7.96 + n * 0.001, -80.43);
  const r: ReporteLocal = {
    ...base,
    id: over.id ?? `0000000${n}-aaaa-4bbb-8ccc-${String(n).padStart(12, "0")}`,
    created_at: "2026-10-01T12:00:00.000Z",
    updated_at: "2026-10-01T12:00:00.000Z",
    attended_at: null,
    club_id: null,
    brigadista_texto: null,
    contacto_nombre: null,
    contacto_telefono: null,
    plus_code: null,
    foto_url: null,
    foto_path: null,
    observaciones_atencion: null,
    total_personas: 0,
    created_by: null,
    updated_by: null,
    _sync: "synced",
    ...over,
  } as ReporteLocal;
  r.total_personas = over.total_personas ?? totalPersonas(r);
  return r;
}
