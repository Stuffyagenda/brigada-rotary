import { describe, expect, it } from "vitest";
import { reporteFicticio } from "@/components/sheet/fixtures";
import {
  alternar,
  aplicarFiltros,
  contarFiltrosExtra,
  contarPorVigencia,
  FILTROS_VACIOS,
  hrefDe,
  parseFiltros,
  parseVista,
  writeFiltros,
  writeVista,
} from "./url-state";

const CLUB = "11111111-2222-4333-8444-555555555555";
/** Mediodía en Panamá del 19 de octubre de 2026. */
const AHORA = new Date("2026-10-19T17:00:00Z");

describe("filtros en la URL", () => {
  it("lee listas separadas por comas e ignora valores desconocidos", () => {
    const f = parseFiltros(
      new URLSearchParams(
        `vigencia=pendiente,vencido,XX&prioridad=ALTA,BAJA&necesidad=agua,otros,nada&club=${CLUB},<script>`,
      ),
    );
    expect(f).toEqual({
      vigencia: ["pendiente", "vencido"],
      prioridad: ["ALTA", "BAJA"],
      necesidad: ["agua", "otros"],
      club: [CLUB],
    });
  });

  it("acepta el antiguo estado= como alias de vigencia", () => {
    expect(parseFiltros(new URLSearchParams("estado=PENDIENTE")).vigencia).toEqual(["pendiente"]);
    expect(parseFiltros(new URLSearchParams("estado=ATENDIDO")).vigencia).toEqual(["reciente", "por-vencer", "vencido"]);
    expect(parseFiltros(new URLSearchParams("estado=ATENDIDO,PENDIENTE,XX")).vigencia).toEqual([
      "pendiente",
      "reciente",
      "por-vencer",
      "vencido",
    ]);
    // Si están los dos, manda vigencia.
    expect(parseFiltros(new URLSearchParams("estado=ATENDIDO&vigencia=pendiente")).vigencia).toEqual(["pendiente"]);
  });

  it("al escribir, traduce el alias a vigencia= y quita estado=", () => {
    const params = new URLSearchParams("reporte=abc&estado=ATENDIDO");
    const p = writeFiltros(params, parseFiltros(params));
    expect(p.has("estado")).toBe(false);
    expect(p.get("vigencia")).toBe("reciente,por-vencer,vencido");
    expect(p.get("reporte")).toBe("abc");
  });

  it("escribe los filtros sin tocar el resto y borra los vacíos", () => {
    const p = writeFiltros(new URLSearchParams("reporte=abc&vigencia=reciente"), {
      ...FILTROS_VACIOS,
      prioridad: ["ALTA"],
    });
    expect(p.get("reporte")).toBe("abc");
    expect(p.has("vigencia")).toBe(false);
    expect(p.get("prioridad")).toBe("ALTA");
    expect(parseFiltros(p).prioridad).toEqual(["ALTA"]);
  });

  it("cuenta los filtros extra (sin la vigencia) y alterna valores", () => {
    expect(
      contarFiltrosExtra({ vigencia: ["pendiente", "vencido"], prioridad: ["ALTA"], necesidad: ["agua", "lona"], club: [] }),
    ).toBe(3);
    expect(alternar(["a", "b"], "a")).toEqual(["b"]);
    expect(alternar(["a"], "b")).toEqual(["a", "b"]);
  });
});

describe("aplicarFiltros", () => {
  const agua = reporteFicticio({ nec_agua: true, prioridad: "ALTA" });
  const otros = reporteFicticio({ nec_otros: ["Frazadas"], prioridad: "MEDIA", club_id: CLUB });
  const atendido = reporteFicticio({ estado: "ATENDIDO", attended_at: "2026-10-02T00:00:00Z", nec_lona: true });
  const todos = [agua, otros, atendido];

  it("sin filtros devuelve todo", () => {
    expect(aplicarFiltros(todos, FILTROS_VACIOS, { ahora: AHORA })).toHaveLength(3);
  });

  it("dentro de necesidad suma opciones (O), incluido 'otros'", () => {
    const r = aplicarFiltros(todos, { ...FILTROS_VACIOS, necesidad: ["agua", "otros"] }, { ahora: AHORA });
    expect(r.map((x) => x.id)).toEqual([agua.id, otros.id]);
  });

  it("entre filtros exige todos (Y)", () => {
    const r = aplicarFiltros(todos, { ...FILTROS_VACIOS, necesidad: ["agua", "otros"], club: [CLUB] }, { ahora: AHORA });
    expect(r.map((x) => x.id)).toEqual([otros.id]);
  });

  it("filtra por vigencia y omitirVigencia la ignora (para los conteos de los chips)", () => {
    const f = { ...FILTROS_VACIOS, vigencia: ["vencido" as const] };
    expect(aplicarFiltros(todos, f, { ahora: AHORA }).map((x) => x.id)).toEqual([atendido.id]);
    expect(aplicarFiltros(todos, f, { omitirVigencia: true, ahora: AHORA })).toHaveLength(3);
  });

  it("la vigencia depende de ahora: el mismo atendido pasa de reciente a vencido", () => {
    const f = { ...FILTROS_VACIOS, vigencia: ["reciente" as const] };
    expect(aplicarFiltros([atendido], f, { ahora: new Date("2026-10-03T17:00:00Z") })).toHaveLength(1);
    expect(aplicarFiltros([atendido], f, { ahora: AHORA })).toHaveLength(0);
  });
});

describe("contarPorVigencia", () => {
  it("cuenta pendientes, atendidos 0 a 3 días, 4 a 6 y 7 o más", () => {
    const reportes = [
      reporteFicticio(),
      reporteFicticio(),
      reporteFicticio({ estado: "ATENDIDO", attended_at: "2026-10-19T14:00:00Z" }), // hoy
      reporteFicticio({ estado: "ATENDIDO", attended_at: "2026-10-16T15:00:00Z" }), // 3 días
      reporteFicticio({ estado: "ATENDIDO", attended_at: "2026-10-15T15:00:00Z" }), // 4 días
      reporteFicticio({ estado: "ATENDIDO", attended_at: "2026-10-13T15:00:00Z" }), // 6 días
      reporteFicticio({ estado: "ATENDIDO", attended_at: "2026-10-12T15:00:00Z" }), // 7 días
      reporteFicticio({ estado: "ATENDIDO", attended_at: "2026-09-01T15:00:00Z" }),
    ];
    expect(contarPorVigencia(reportes, AHORA)).toEqual({
      pendiente: 2,
      reciente: 2,
      "por-vencer": 2,
      vencido: 2,
    });
  });

  it("los días se cuentan en hora de Panamá", () => {
    // 2026-10-16 03:00 UTC es el 15 de octubre a las 22:00 en Panamá: 4 días antes del 19.
    const r = reporteFicticio({ estado: "ATENDIDO", attended_at: "2026-10-16T03:00:00Z" });
    expect(contarPorVigencia([r], AHORA)["por-vencer"]).toBe(1);
  });
});

describe("vista del panel", () => {
  it("lee resumen, ficha, formulario nuevo, edición y nueva visita", () => {
    expect(parseVista(new URLSearchParams(""))).toEqual({ tipo: "resumen" });
    expect(parseVista(new URLSearchParams("reporte=abc"))).toEqual({ tipo: "ficha", id: "abc" });
    expect(parseVista(new URLSearchParams("reporte=nuevo"))).toEqual({ tipo: "formulario", id: "nuevo" });
    expect(parseVista(new URLSearchParams("reporte=abc&editar=1"))).toEqual({ tipo: "formulario", id: "abc" });
    expect(parseVista(new URLSearchParams("reporte=abc&visita=1"))).toEqual({ tipo: "visita", id: "abc" });
    // "nuevo" no admite visita: es un formulario de reporte.
    expect(parseVista(new URLSearchParams("reporte=nuevo&visita=1"))).toEqual({ tipo: "formulario", id: "nuevo" });
  });

  it("escribe la vista conservando los filtros", () => {
    const base = new URLSearchParams("vigencia=pendiente&reporte=abc&editar=1");
    expect(writeVista(base, { tipo: "ficha", id: "xyz" }).toString()).toBe("vigencia=pendiente&reporte=xyz");
    expect(writeVista(base, { tipo: "resumen" }).toString()).toBe("vigencia=pendiente");
    expect(writeVista(base, { tipo: "formulario", id: "nuevo" }).get("editar")).toBeNull();
    expect(writeVista(base, { tipo: "formulario", id: "xyz" }).get("editar")).toBe("1");
    expect(hrefDe("/", new URLSearchParams())).toBe("/");
    expect(hrefDe("/", new URLSearchParams("a=1"))).toBe("/?a=1");
  });

  it("abre y cierra la visita: ?reporte=id&visita=1 y vuelta a ?reporte=id", () => {
    const visita = writeVista(new URLSearchParams("vigencia=vencido&reporte=abc"), { tipo: "visita", id: "abc" });
    expect(visita.toString()).toBe("vigencia=vencido&reporte=abc&visita=1");
    expect(writeVista(visita, { tipo: "ficha", id: "abc" }).toString()).toBe("vigencia=vencido&reporte=abc");
    // Editar desde una visita no deja los dos parámetros a la vez.
    const editar = writeVista(visita, { tipo: "formulario", id: "abc" });
    expect(editar.get("visita")).toBeNull();
    expect(editar.get("editar")).toBe("1");
  });
});
