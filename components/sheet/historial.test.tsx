import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { db, type VisitaLocal } from "@/lib/db";
import { reporteFicticio } from "./fixtures";
import { Historial } from "./Historial";
import { entradasHistorial } from "./historial-entradas";

const REPORTE_ID = "abcdef12-0000-4000-8000-0000000000aa";

let n = 0;
function visitaFicticia(over: Partial<VisitaLocal> = {}): VisitaLocal {
  n += 1;
  return {
    id: `0000000${n}-bbbb-4ccc-8ddd-${String(n).padStart(12, "0")}`,
    reporte_id: REPORTE_ID,
    fecha: "2026-10-10",
    visitado_at: "2026-10-10T15:00:00.000Z",
    brigadista_texto: null,
    created_at: "2026-10-10T15:00:00.000Z",
    created_by: null,
    ent_agua: false,
    ent_kit_alimento: false,
    ent_kit_higiene: false,
    ent_lona: false,
    ent_camping: false,
    ent_toldas: false,
    ent_colchonetas: false,
    ent_otros: [],
    observaciones: null,
    _sync: "synced",
    ...over,
  };
}

describe("entradasHistorial", () => {
  it("pendiente sin visitas: nada que mostrar", () => {
    expect(entradasHistorial(reporteFicticio(), [])).toEqual([]);
  });

  it("atendido sin visitas: solo la atención inicial, con sus entregas", () => {
    const r = reporteFicticio({
      estado: "ATENDIDO",
      attended_at: "2026-10-02T15:00:00Z",
      ent_agua: true,
      ent_otros: ["Frazadas"],
      observaciones_atencion: "  Entregado en mano ",
    });
    expect(entradasHistorial(r, [])).toEqual([
      {
        tipo: "atencion",
        id: "atencion",
        titulo: "Atención inicial",
        fecha: "2026-10-02",
        entregas: ["Agua", "Frazadas"],
        observaciones: "Entregado en mano",
      },
    ]);
  });

  it("ordena las visitas de la más reciente a la más antigua y omite la atención ya sustituida", () => {
    const vieja = visitaFicticia({ fecha: "2026-10-05", visitado_at: "2026-10-05T15:00:00.000Z", ent_lona: true });
    const nueva = visitaFicticia({
      fecha: "2026-10-12",
      visitado_at: "2026-10-12T15:00:00.000Z",
      brigadista_texto: " Brigadista Ficticio ",
      ent_kit_alimento: true,
      _sync: "pending",
    });
    // saveVisita copió el instante de la última visita al reporte (con otro formato de hora).
    const r = reporteFicticio({ estado: "ATENDIDO", attended_at: "2026-10-12T15:00:00+00:00" });
    const entradas = entradasHistorial(r, [vieja, nueva]);
    expect(entradas.map((e) => e.id)).toEqual([nueva.id, vieja.id]);
    expect(entradas[0]).toEqual(
      expect.objectContaining({ tipo: "visita", brigadista: "Brigadista Ficticio", entregas: ["Kit de alimentos"], sync: "pending" }),
    );
  });

  it("la atención del reporte anterior a todas las visitas es la atención inicial, al final", () => {
    const visita = visitaFicticia({ fecha: "2026-10-12", visitado_at: "2026-10-12T15:00:00.000Z" });
    const r = reporteFicticio({ estado: "ATENDIDO", attended_at: "2026-10-02T15:00:00Z" });
    const entradas = entradasHistorial(r, [visita]);
    expect(entradas.map((e) => e.tipo)).toEqual(["visita", "atencion"]);
    expect(entradas[1]).toEqual(expect.objectContaining({ titulo: "Atención inicial", fecha: "2026-10-02" }));
  });

  it("una atención del reporte posterior a las visitas va en su lugar cronológico", () => {
    // Visita con fecha pasada registrada después: no sustituye la atención del reporte.
    const visita = visitaFicticia({ fecha: "2026-10-03", visitado_at: "2026-10-03T15:00:00.000Z" });
    const r = reporteFicticio({ estado: "ATENDIDO", attended_at: "2026-10-09T15:00:00Z" });
    const entradas = entradasHistorial(r, [visita]);
    expect(entradas.map((e) => e.tipo)).toEqual(["atencion", "visita"]);
    expect(entradas[0]).toEqual(expect.objectContaining({ titulo: "Atención registrada en el reporte" }));
  });
});

describe("Historial (ficha)", () => {
  beforeEach(async () => {
    await db.visitas.clear();
  });

  it("no muestra la sección si no hay nada", async () => {
    const { container } = render(<Historial reporte={reporteFicticio({ id: REPORTE_ID })} />);
    // Espera a la primera lectura de IndexedDB.
    await new Promise((r) => setTimeout(r, 50));
    expect(container).toBeEmptyDOMElement();
  });

  it("lista las visitas con fecha, brigadista, entregas, observaciones y estado de envío", async () => {
    await db.visitas.bulkPut([
      visitaFicticia({ fecha: "2026-10-05", visitado_at: "2026-10-05T15:00:00.000Z", ent_agua: true }),
      visitaFicticia({
        fecha: "2026-10-12",
        visitado_at: "2026-10-12T15:00:00.000Z",
        brigadista_texto: "Brigadista Ficticio",
        ent_lona: true,
        ent_otros: ["Ropa"],
        observaciones: "Familia en casa de un vecino",
        _sync: "pending",
      }),
      visitaFicticia({ reporte_id: "otro-reporte", fecha: "2026-10-15" }),
    ]);
    render(
      <Historial reporte={reporteFicticio({ id: REPORTE_ID, estado: "ATENDIDO", attended_at: "2026-10-12T15:00:00.000Z" })} />,
    );
    expect(await screen.findByRole("heading", { name: "Visitas" })).toBeInTheDocument();
    const filas = within(screen.getByTestId("historial")).getAllByTestId("historial-entrada");
    expect(filas).toHaveLength(2);
    expect(filas[0]).toHaveTextContent("12 de octubre de 2026");
    expect(filas[0]).toHaveTextContent("Brigadista Ficticio");
    expect(within(filas[0]).getByText("Lona")).toBeInTheDocument();
    expect(within(filas[0]).getByText("Ropa")).toBeInTheDocument();
    expect(filas[0]).toHaveTextContent("Familia en casa de un vecino");
    expect(filas[0]).toHaveTextContent("Sin enviar");
    expect(filas[1]).toHaveTextContent("5 de octubre de 2026");
    expect(filas[1]).not.toHaveTextContent("Sin enviar");
  });

  it("sin visitas, un atendido muestra la atención inicial", async () => {
    render(<Historial reporte={reporteFicticio({ id: REPORTE_ID, estado: "ATENDIDO", attended_at: "2026-10-02T15:00:00Z" })} />);
    const fila = await screen.findByTestId("historial-entrada");
    expect(fila).toHaveAttribute("data-tipo", "atencion");
    expect(fila).toHaveTextContent("Atención inicial");
    expect(fila).toHaveTextContent("2 de octubre de 2026");
  });
});
