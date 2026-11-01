import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { VIGENCIAS } from "@/lib/vigencia";
import { COLOR } from "./colors";
import { VigenciaChips } from "./Filters";
import { GlifoVigencia } from "./GlifoVigencia";
import { capasPin, ORDEN_DIBUJO } from "./pin-estilo";
import { caminoRombo } from "./rombo";
import { FILTROS_VACIOS } from "./url-state";

describe("pines por vigencia (forma + color)", () => {
  it("pendiente: círculo relleno rojo con borde blanco", () => {
    expect(capasPin("pendiente", true)).toEqual([
      expect.objectContaining({ forma: "circulo", relleno: COLOR.pending, borde: COLOR.white, discontinuo: undefined }),
    ]);
  });

  it("reciente: anillo verde con relleno blanco", () => {
    expect(capasPin("reciente", true)).toEqual([
      expect.objectContaining({ forma: "circulo", borde: COLOR.done, relleno: COLOR.white }),
    ]);
  });

  it("vencido: rombo relleno verde oscuro con borde blanco", () => {
    expect(capasPin("vencido", true)).toEqual([
      expect.objectContaining({ forma: "rombo", relleno: COLOR.stale, borde: COLOR.white }),
    ]);
    expect(COLOR.stale).toBe("#064e2b");
  });

  it("los dos verdes se distinguen también por la forma: anillo (reciente) y rombo (vencido)", () => {
    expect(capasPin("reciente", true)[0].forma).toBe("circulo");
    expect(capasPin("vencido", true)[0].forma).toBe("rombo");
    expect(COLOR.stale).not.toBe(COLOR.done);
  });

  it("sin sincronizar: borde discontinuo en todas las formas", () => {
    for (const v of VIGENCIAS) {
      const capas = capasPin(v, false);
      expect(capas).toHaveLength(1);
      expect(capas[0].discontinuo).toBeTruthy();
    }
  });

  it("dibuja lo más urgente encima: pendientes arriba, atendidos recientes abajo", () => {
    const orden = [...VIGENCIAS].sort((a, b) => ORDEN_DIBUJO[a] - ORDEN_DIBUJO[b]);
    expect(orden).toEqual(["reciente", "vencido", "pendiente"]);
  });

  it("traza el rombo con sus cuatro vértices alrededor del centro", () => {
    expect(caminoRombo(100, 50, 11)).toBe("M100,39L111,50L100,61L89,50Z");
    expect(caminoRombo(10.4, 10.6, 0.2)).toBe("M10,10L11,11L10,12L9,11Z");
  });
});

describe("GlifoVigencia", () => {
  it("marca la vigencia y es decorativo", () => {
    render(<GlifoVigencia vigencia="vencido" tamano="sm" />);
    const g = screen.getByTestId("glifo-vencido");
    expect(g).toHaveAttribute("data-vigencia", "vencido");
    expect(g).toHaveAttribute("data-tamano", "sm");
    expect(g).toHaveAttribute("aria-hidden", "true");
  });
});

describe("VigenciaChips", () => {
  const conteo = { pendiente: 6, reciente: 49, vencido: 2 };

  it("muestra los tres chips con su glifo y su conteo", () => {
    render(<VigenciaChips filtros={FILTROS_VACIOS} conteo={conteo} onChange={vi.fn()} />);
    const grupo = screen.getByRole("group", { name: "Filtrar por vigencia de la atención" });
    const chips = within(grupo).getAllByRole("button");
    expect(chips.map((c) => c.textContent)).toEqual([
      "Pendientes6",
      "Atendidos: Atendido hace 14 días o menos49",
      "15+ días: Atendido hace 15 días o más: necesita nueva visita2",
    ]);
    for (const v of VIGENCIAS) expect(within(grupo).getByTestId(`glifo-${v}`)).toBeInTheDocument();
    for (const c of chips) expect(c).toHaveAttribute("aria-pressed", "false");
  });

  it("alterna la vigencia al pulsar un chip", async () => {
    const onChange = vi.fn();
    render(
      <VigenciaChips filtros={{ ...FILTROS_VACIOS, vigencia: ["pendiente"] }} conteo={conteo} onChange={onChange} />,
    );
    expect(screen.getByRole("button", { name: /^Pendientes/ })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: /^15\+ días/ }));
    expect(onChange).toHaveBeenCalledWith({ ...FILTROS_VACIOS, vigencia: ["pendiente", "vencido"] });
  });

  it("sobre el mapa, el botón Filtros va primero para estar siempre a mano", () => {
    render(
      <VigenciaChips filtros={FILTROS_VACIOS} conteo={conteo} onChange={vi.fn()} flotante onAbrirFiltros={vi.fn()} />,
    );
    const botones = screen.getAllByRole("button");
    expect(botones[0]).toHaveTextContent("Filtros");
    expect(botones).toHaveLength(4);
  });
});
