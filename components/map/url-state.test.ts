import { describe, expect, it } from "vitest";
import { reporteFicticio } from "@/components/sheet/fixtures";
import {
  alternar,
  aplicarFiltros,
  contarFiltrosExtra,
  contarPorEstado,
  FILTROS_VACIOS,
  hrefDe,
  parseFiltros,
  parseVista,
  writeFiltros,
  writeVista,
} from "./url-state";

const CLUB = "11111111-2222-4333-8444-555555555555";

describe("filtros en la URL", () => {
  it("lee listas separadas por comas e ignora valores desconocidos", () => {
    const f = parseFiltros(
      new URLSearchParams(`estado=PENDIENTE,XX&prioridad=ALTA,BAJA&necesidad=agua,otros,nada&club=${CLUB},<script>`),
    );
    expect(f).toEqual({
      estado: ["PENDIENTE"],
      prioridad: ["ALTA", "BAJA"],
      necesidad: ["agua", "otros"],
      club: [CLUB],
    });
  });

  it("escribe los filtros sin tocar el resto y borra los vacíos", () => {
    const p = writeFiltros(new URLSearchParams("reporte=abc&estado=ATENDIDO"), {
      ...FILTROS_VACIOS,
      prioridad: ["ALTA"],
    });
    expect(p.get("reporte")).toBe("abc");
    expect(p.has("estado")).toBe(false);
    expect(p.get("prioridad")).toBe("ALTA");
    expect(parseFiltros(p).prioridad).toEqual(["ALTA"]);
  });

  it("cuenta los filtros extra y alterna valores", () => {
    expect(contarFiltrosExtra({ estado: ["PENDIENTE"], prioridad: ["ALTA"], necesidad: ["agua", "lona"], club: [] })).toBe(3);
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
    expect(aplicarFiltros(todos, FILTROS_VACIOS)).toHaveLength(3);
  });

  it("dentro de necesidad suma opciones (O), incluido 'otros'", () => {
    const r = aplicarFiltros(todos, { ...FILTROS_VACIOS, necesidad: ["agua", "otros"] });
    expect(r.map((x) => x.id)).toEqual([agua.id, otros.id]);
  });

  it("entre filtros exige todos (Y)", () => {
    const r = aplicarFiltros(todos, { ...FILTROS_VACIOS, necesidad: ["agua", "otros"], club: [CLUB] });
    expect(r.map((x) => x.id)).toEqual([otros.id]);
  });

  it("omitirEstado ignora el estado (para los conteos de los chips)", () => {
    const f = { ...FILTROS_VACIOS, estado: ["ATENDIDO" as const] };
    expect(aplicarFiltros(todos, f)).toHaveLength(1);
    const sinEstado = aplicarFiltros(todos, f, { omitirEstado: true });
    expect(contarPorEstado(sinEstado)).toEqual({ PENDIENTE: 2, ATENDIDO: 1 });
  });
});

describe("vista del panel", () => {
  it("lee resumen, ficha, formulario nuevo y edición", () => {
    expect(parseVista(new URLSearchParams(""))).toEqual({ tipo: "resumen" });
    expect(parseVista(new URLSearchParams("reporte=abc"))).toEqual({ tipo: "ficha", id: "abc" });
    expect(parseVista(new URLSearchParams("reporte=nuevo"))).toEqual({ tipo: "formulario", id: "nuevo" });
    expect(parseVista(new URLSearchParams("reporte=abc&editar=1"))).toEqual({ tipo: "formulario", id: "abc" });
  });

  it("escribe la vista conservando los filtros", () => {
    const base = new URLSearchParams("estado=PENDIENTE&reporte=abc&editar=1");
    expect(writeVista(base, { tipo: "ficha", id: "xyz" }).toString()).toBe("estado=PENDIENTE&reporte=xyz");
    expect(writeVista(base, { tipo: "resumen" }).toString()).toBe("estado=PENDIENTE");
    expect(writeVista(base, { tipo: "formulario", id: "nuevo" }).get("editar")).toBeNull();
    expect(writeVista(base, { tipo: "formulario", id: "xyz" }).get("editar")).toBe("1");
    expect(hrefDe("/", new URLSearchParams())).toBe("/");
    expect(hrefDe("/", new URLSearchParams("a=1"))).toBe("/?a=1");
  });
});
