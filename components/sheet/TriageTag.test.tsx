import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ordenarPendientes } from "./PanelResumen";
import { reporteFicticio } from "./fixtures";
import { TriageTag } from "./TriageTag";

function renderTag(over: Parameters<typeof reporteFicticio>[0] = {}, props: Partial<Parameters<typeof TriageTag>[0]> = {}) {
  const onEditar = vi.fn();
  const onRegistrarEntrega = vi.fn();
  const reporte = reporteFicticio({
    contacto_nombre: "Familia Ficticia",
    contacto_telefono: "6000-0001",
    prioridad: "ALTA",
    danio_vivienda: "TOTAL / INHABITABLE",
    adultos: 2,
    menores: 1,
    nec_agua: true,
    ...over,
  });
  render(<TriageTag reporte={reporte} onEditar={onEditar} onRegistrarEntrega={onRegistrarEntrega} {...props} />);
  return { reporte, onEditar, onRegistrarEntrega };
}

describe("TriageTag", () => {
  it("muestra el sello, la prioridad y el contacto con enlaces", () => {
    renderTag();
    expect(screen.getByTestId("triage-tag")).toHaveAttribute("data-estado", "PENDIENTE");
    expect(screen.getByRole("heading", { name: "Familia Ficticia" })).toBeInTheDocument();
    expect(screen.getByText("Alta")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /6000-0001/ })).toHaveAttribute("href", "tel:+50760000001");
    expect(screen.getByRole("link", { name: "WhatsApp" })).toHaveAttribute("href", "https://wa.me/50760000001");
    expect(screen.getByText("Destrucción total / Inhabitable")).toBeInTheDocument();
    expect(screen.getByText("3 personas")).toBeInTheDocument();
    expect(screen.getByText("Agua")).toBeInTheDocument();
  });

  it("si está pendiente, la acción principal es Registrar entrega", async () => {
    const { onRegistrarEntrega, onEditar } = renderTag();
    await userEvent.click(screen.getByRole("button", { name: "Registrar entrega" }));
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    expect(onRegistrarEntrega).toHaveBeenCalledOnce();
    expect(onEditar).toHaveBeenCalledOnce();
  });

  it("atendido: sin Registrar entrega y con la sección Entregado", () => {
    renderTag({ estado: "ATENDIDO", attended_at: "2026-10-02T00:00:00Z", ent_lona: true, observaciones_atencion: "Entregado en mano" });
    expect(screen.getByTestId("triage-tag")).toHaveAttribute("data-estado", "ATENDIDO");
    expect(screen.queryByRole("button", { name: "Registrar entrega" })).not.toBeInTheDocument();
    expect(screen.getByText("Lona")).toBeInTheDocument();
    expect(screen.getByText("Entregado en mano")).toBeInTheDocument();
  });

  it("el borrado solo aparece para admin", () => {
    renderTag({}, { puedeBorrar: false, onBorrar: vi.fn() });
    expect(screen.queryByRole("button", { name: /borrar/i })).not.toBeInTheDocument();
  });

  it("muestra el borrado (mantener pulsado) a un admin", () => {
    renderTag({}, { puedeBorrar: true, onBorrar: vi.fn() });
    expect(screen.getByRole("button", { name: /Mantén pulsado 2 segundos para borrar/ })).toBeInTheDocument();
  });

  it("avisa si el reporte no está sincronizado y muestra la foto guardada", async () => {
    renderTag({ _sync: "pending", foto_path: "x/y.jpg" });
    expect(screen.getByText(/Se enviará cuando haya señal/)).toBeInTheDocument();
    // Sin Supabase en los tests no hay URL firmada: se indica que la foto existe.
    expect(await screen.findByText(/Foto guardada/)).toBeInTheDocument();
  });

  it("no une metadatos con '·' ni usa flechas", () => {
    renderTag({ brigadista_texto: "Brigadista ficticio" }, { clubNombre: "Club de prueba" });
    const texto = screen.getByTestId("triage-tag").textContent ?? "";
    expect(texto).not.toContain("·");
    expect(texto).not.toContain("→");
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
