import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ordenarPendientes, ordenarVencidos, textoNecesitanVisita } from "./PanelResumen";
import { reporteFicticio } from "./fixtures";
import { AccionesFicha, TriageTag } from "./TriageTag";

/** Mediodía en Panamá del 19 de octubre de 2026. */
const AHORA = new Date("2026-10-19T17:00:00Z");
const ATENDIDO_HACE = {
  reciente: { estado: "ATENDIDO" as const, attended_at: "2026-10-17T15:00:00Z" }, // 2 días
  porVencer: { estado: "ATENDIDO" as const, attended_at: "2026-10-14T15:00:00Z" }, // 5 días
  vencido: { estado: "ATENDIDO" as const, attended_at: "2026-10-09T15:00:00Z" }, // 10 días
};

function renderTag(over: Parameters<typeof reporteFicticio>[0] = {}, props: Partial<Parameters<typeof TriageTag>[0]> = {}) {
  const onEditar = vi.fn();
  const onRegistrarEntrega = vi.fn();
  const onRegistrarVisita = vi.fn();
  const reporte = reporteFicticio({
    contacto_nombre: "Familia Ficticia",
    contacto_telefono: "6000-0001",
    prioridad: "ALTA",
    danio_vivienda: "TOTAL / INHABITABLE",
    adultos: 2,
    menores: 1,
    nec_agua: true,
    fecha_reporte: "2026-10-08",
    ...over,
  });
  const vista = render(
    <TriageTag
      reporte={reporte}
      onEditar={onEditar}
      onRegistrarEntrega={onRegistrarEntrega}
      onRegistrarVisita={onRegistrarVisita}
      ahora={AHORA}
      {...props}
    />,
  );
  return { reporte, onEditar, onRegistrarEntrega, onRegistrarVisita, vista };
}

/** Texto visible del sello (el que no está oculto). */
function selloVisible(): string {
  const sello = screen.getByTestId("sello");
  return [...sello.querySelectorAll("span[data-visible='true']")].map((s) => s.textContent).join("");
}

describe("TriageTag", () => {
  it("muestra el sello, la prioridad, la fecha del reporte y el contacto con enlaces", () => {
    renderTag();
    expect(screen.getByTestId("triage-tag")).toHaveAttribute("data-estado", "PENDIENTE");
    expect(screen.getByRole("heading", { name: "Familia Ficticia" })).toBeInTheDocument();
    expect(screen.getByText("Alta")).toBeInTheDocument();
    expect(screen.getByText("Reporte del 8 de octubre de 2026")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /6000-0001/ })).toHaveAttribute("href", "tel:+50760000001");
    expect(screen.getByRole("link", { name: "WhatsApp" })).toHaveAttribute("href", "https://wa.me/50760000001");
    expect(screen.getByText("Destrucción total / Inhabitable")).toBeInTheDocument();
    expect(screen.getByText("3 personas")).toBeInTheDocument();
    expect(screen.getByText("Agua")).toBeInTheDocument();
  });

  it("si está pendiente, la acción principal es Registrar entrega (sin nueva visita)", async () => {
    const { onRegistrarEntrega, onEditar } = renderTag();
    expect(screen.queryByRole("button", { name: "Registrar nueva visita" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Registrar entrega" }));
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    expect(onRegistrarEntrega).toHaveBeenCalledOnce();
    expect(onEditar).toHaveBeenCalledOnce();
  });

  it("atendido: sin Registrar entrega y con la sección Entregado", () => {
    renderTag({ ...ATENDIDO_HACE.vencido, ent_lona: true, observaciones_atencion: "Entregado en mano" });
    expect(screen.getByTestId("triage-tag")).toHaveAttribute("data-estado", "ATENDIDO");
    expect(screen.queryByRole("button", { name: "Registrar entrega" })).not.toBeInTheDocument();
    expect(screen.getAllByText("Lona").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Entregado en mano").length).toBeGreaterThan(0);
  });

  it("nadie ve una acción de borrar en la ficha (los reportes solo se editan)", () => {
    for (const over of [{}, ATENDIDO_HACE.vencido]) {
      const { vista } = renderTag(over);
      expect(screen.queryByRole("button", { name: /borrar|eliminar/i })).not.toBeInTheDocument();
      expect(screen.queryByText(/mantén pulsado/i)).not.toBeInTheDocument();
      vista.unmount();
    }
  });

  it("avisa si el reporte no está sincronizado y muestra la foto guardada", async () => {
    renderTag({ _sync: "pending", foto_path: "x/y.jpg" });
    expect(screen.getByText(/Se enviará cuando haya señal/)).toBeInTheDocument();
    // Sin Supabase en los tests no hay URL firmada: se indica que la foto existe.
    expect(await screen.findByText(/Foto guardada/)).toBeInTheDocument();
  });

  it("no une metadatos con '·' ni usa flechas", () => {
    renderTag({ brigadista_texto: "Brigadista ficticio", ...ATENDIDO_HACE.porVencer }, { clubNombre: "Club de prueba" });
    const texto = screen.getByTestId("triage-tag").textContent ?? "";
    expect(texto).not.toContain("·");
    expect(texto).not.toContain("→");
  });
});

describe("TriageTag por vigencia", () => {
  it("pendiente: franja roja y sello PENDIENTE, sin 'Atendido hace'", () => {
    renderTag();
    expect(screen.getByTestId("triage-tag")).toHaveAttribute("data-vigencia", "pendiente");
    expect(selloVisible()).toBe("PENDIENTE");
    expect(screen.queryByText(/Atendido hace/)).not.toBeInTheDocument();
    expect(screen.queryByText("Necesita nueva visita")).not.toBeInTheDocument();
  });

  it("reciente: franja verde, sello ATENDIDO y nueva visita secundaria", () => {
    renderTag(ATENDIDO_HACE.reciente);
    expect(screen.getByTestId("triage-tag")).toHaveAttribute("data-vigencia", "reciente");
    expect(selloVisible()).toBe("ATENDIDO");
    expect(screen.queryByTestId("sello-nota")).not.toBeInTheDocument();
    expect(screen.getByText("Atendido hace 2 días")).toBeInTheDocument();
    const visita = screen.getByRole("button", { name: "Registrar nueva visita" });
    expect(visita).toHaveAttribute("data-variant", "secondary");
    expect(visita).toHaveAttribute("data-enfasis", "reciente");
  });

  it("por vencer: franja naranja, sello ATENDIDO con 'hace N días' debajo y visita destacada", () => {
    renderTag(ATENDIDO_HACE.porVencer);
    expect(screen.getByTestId("triage-tag")).toHaveAttribute("data-vigencia", "por-vencer");
    expect(selloVisible()).toBe("ATENDIDO");
    expect(screen.getByTestId("sello-nota")).toHaveTextContent("hace 5 días");
    expect(screen.getByText("Atendido hace 5 días")).toBeInTheDocument();
    expect(screen.queryByText("Necesita nueva visita")).not.toBeInTheDocument();
    const visita = screen.getByRole("button", { name: "Registrar nueva visita" });
    expect(visita).toHaveAttribute("data-variant", "secondary");
    expect(visita).toHaveAttribute("data-enfasis", "por-vencer");
    expect(visita.className).toContain("border-aging");
  });

  it("vencido: franja negra, sello REVISITAR, 'Necesita nueva visita' y visita como acción principal", async () => {
    const { onRegistrarVisita } = renderTag(ATENDIDO_HACE.vencido);
    expect(screen.getByTestId("triage-tag")).toHaveAttribute("data-vigencia", "vencido");
    expect(selloVisible()).toBe("REVISITAR");
    expect(screen.getByText("Atendido hace 10 días")).toBeInTheDocument();
    expect(screen.getByText("Necesita nueva visita")).toBeInTheDocument();
    const visita = screen.getByRole("button", { name: "Registrar nueva visita" });
    expect(visita).toHaveAttribute("data-variant", "primary");
    await userEvent.click(visita);
    expect(onRegistrarVisita).toHaveBeenCalledOnce();
  });

  it("el sello en mayúsculas es solo el sello: el resto del texto no va en mayúsculas", () => {
    renderTag(ATENDIDO_HACE.vencido);
    const cuerpo = screen.getByTestId("ficha-vigencia").textContent ?? "";
    expect(cuerpo).not.toMatch(/[A-ZÁÉÍÓÚÑ]{4,}/);
  });

  it("momento orquestado: se monta con la vigencia anterior y cambia a la actual", async () => {
    renderTag(ATENDIDO_HACE.reciente, { animarDesde: "vencido" });
    expect(screen.getByTestId("triage-tag")).toHaveAttribute("data-vigencia", "vencido");
    await act(() => new Promise((r) => requestAnimationFrame(() => r(null))));
    expect(screen.getByTestId("triage-tag")).toHaveAttribute("data-vigencia", "reciente");
    expect(selloVisible()).toBe("ATENDIDO");
  });

  it("al pasar el tiempo cambia de vigencia sola", async () => {
    const { reporte, vista } = renderTag(ATENDIDO_HACE.reciente);
    expect(screen.getByTestId("triage-tag")).toHaveAttribute("data-vigencia", "reciente");
    vista.rerender(
      <TriageTag
        reporte={reporte}
        onEditar={vi.fn()}
        onRegistrarEntrega={vi.fn()}
        onRegistrarVisita={vi.fn()}
        ahora={new Date("2026-10-25T17:00:00Z")}
      />,
    );
    await act(() => new Promise((r) => requestAnimationFrame(() => r(null))));
    expect(screen.getByTestId("triage-tag")).toHaveAttribute("data-vigencia", "vencido");
  });
});

describe("AccionesFicha (barra fija del móvil)", () => {
  const props = { onEditar: vi.fn(), onRegistrarEntrega: vi.fn(), onRegistrarVisita: vi.fn() };

  it("la acción primaria cambia con la vigencia", () => {
    const primaria = () =>
      within(document.body)
        .getAllByRole("button")
        .find((b) => b.getAttribute("data-variant") === "primary")?.textContent ?? null;
    const { rerender } = render(<AccionesFicha vigencia="pendiente" {...props} />);
    expect(primaria()).toBe("Registrar entrega");
    rerender(<AccionesFicha vigencia="reciente" {...props} />);
    expect(primaria()).toBeNull();
    expect(screen.getByRole("button", { name: "Registrar nueva visita" })).toBeInTheDocument();
    rerender(<AccionesFicha vigencia="por-vencer" {...props} />);
    expect(primaria()).toBeNull();
    rerender(<AccionesFicha vigencia="vencido" {...props} />);
    expect(primaria()).toBe("Registrar nueva visita");
    expect(screen.getByRole("button", { name: "Editar" })).toBeInTheDocument();
  });
});

describe("ordenarPendientes", () => {
  it("ordena por prioridad y luego por fecha, y descarta atendidos", () => {
    const baja = reporteFicticio({ prioridad: "BAJA", updated_at: "2026-10-05T00:00:00Z" });
    const altaVieja = reporteFicticio({ prioridad: "ALTA", updated_at: "2026-10-01T00:00:00Z" });
    const altaNueva = reporteFicticio({ prioridad: "ALTA", updated_at: "2026-10-04T00:00:00Z" });
    const atendido = reporteFicticio({ estado: "ATENDIDO", attended_at: "2026-10-02T00:00:00Z" });
    expect(ordenarPendientes([baja, altaVieja, atendido, altaNueva]).map((r) => r.id)).toEqual([
      altaNueva.id,
      altaVieja.id,
      baja.id,
    ]);
  });
});

describe("ordenarVencidos", () => {
  it("solo los atendidos hace 7 días o más, el más antiguo primero", () => {
    const hace10 = reporteFicticio(ATENDIDO_HACE.vencido);
    const hace30 = reporteFicticio({ estado: "ATENDIDO", attended_at: "2026-09-19T15:00:00Z" });
    const reciente = reporteFicticio(ATENDIDO_HACE.reciente);
    const porVencer = reporteFicticio(ATENDIDO_HACE.porVencer);
    const pendiente = reporteFicticio();
    expect(ordenarVencidos([hace10, reciente, hace30, porVencer, pendiente], AHORA).map((r) => r.id)).toEqual([
      hace30.id,
      hace10.id,
    ]);
    expect(textoNecesitanVisita(1)).toBe("1 familia necesita nueva visita");
    expect(textoNecesitanVisita(3)).toBe("3 familias necesitan nueva visita");
  });
});
