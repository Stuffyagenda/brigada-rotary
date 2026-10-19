import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { META_ULTIMO_BRIGADISTA } from "@/lib/brigadista";
import { db, type ReporteLocal } from "@/lib/db";
import { MSG_VISITA_VACIA, reporteVacio } from "@/lib/types";
import { formatearFechaLarga, hoyPanama } from "@/lib/vigencia";

const mocks = vi.hoisted(() => ({
  saveVisita: vi.fn(),
  useReporte: vi.fn(),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

vi.mock("@/lib/sync", () => ({
  saveVisita: mocks.saveVisita,
  MSG_VISITA_SIN_REPORTE: "No se encontró el reporte de esta visita.",
}));
vi.mock("@/hooks/useReportes", () => ({ useReporte: mocks.useReporte }));
vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@/lib/auth/profile", () => ({
  useProfile: () => ({
    profile: {
      id: "u1",
      nombre_completo: "Ana Brigadista",
      club_id: "11111111-1111-4111-8111-111111111111",
      rol: "miembro",
      activo: true,
      created_at: "",
      updated_at: "",
    },
    club: null,
    isAdmin: false,
    loading: false,
  }),
}));

import { MENSAJES_VISITA, VisitaForm } from "@/components/form/VisitaForm";

const ID = "5f0c7c1e-3b7a-4d1e-9a51-6f1f4f0f2a11";
const VISITA_ID = "9b2d4c3e-1a2b-4c5d-8e9f-0a1b2c3d4e5f";
const DIA = 24 * 60 * 60 * 1000;
const fechaRelativa = (dias: number) => hoyPanama(new Date(Date.now() + dias * DIA));

function reporteGuardado(extra: Partial<ReporteLocal> = {}): ReporteLocal {
  return {
    ...reporteVacio(7.9616, -80.4245),
    id: ID,
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-02T00:00:00.000Z",
    club_id: "22222222-2222-4222-8222-222222222222",
    brigadista_texto: "Luis",
    contacto_nombre: "Familia Pérez",
    estado: "ATENDIDO",
    // Hace 8 días.
    attended_at: new Date(Date.now() - 8 * DIA).toISOString(),
    created_by: null,
    updated_by: null,
    total_personas: 0,
    _sync: "synced",
    ...extra,
  } as ReporteLocal;
}

function montar(props: Partial<Parameters<typeof VisitaForm>[0]> = {}) {
  const handlers = { onClose: vi.fn(), onSaved: vi.fn(), onDirtyChange: vi.fn() };
  const user = userEvent.setup();
  render(<VisitaForm reporteId={ID} {...handlers} {...props} />);
  return { user, ...handlers };
}

const siEn = (label: string) => within(screen.getByRole("radiogroup", { name: label })).getByRole("radio", { name: "Sí" });

async function confirmar(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Guardar visita" }));
  return screen.findByRole("alertdialog");
}

beforeEach(async () => {
  await db.meta.clear();
  mocks.saveVisita.mockReset();
  mocks.saveVisita.mockResolvedValue({ id: VISITA_ID, status: "pending" });
  mocks.useReporte.mockReset();
  mocks.useReporte.mockReturnValue({ reporte: reporteGuardado(), loading: false });
  mocks.toast.mockReset();
  mocks.toast.success.mockReset();
  mocks.toast.error.mockReset();
});

describe("VisitaForm: valores por defecto y contexto", () => {
  it("muestra el contexto del reporte, la fecha de hoy, el brigadista del perfil y todo en No", () => {
    montar();
    expect(mocks.useReporte).toHaveBeenCalledWith(ID);
    expect(screen.getByRole("heading", { name: "Registrar visita" })).toBeInTheDocument();
    expect(screen.getByTestId("franja-estado")).toHaveTextContent("Nueva visita");
    const contexto = screen.getByTestId("contexto-visita");
    expect(contexto).toHaveTextContent("Familia Pérez");
    expect(contexto).toHaveTextContent("Última atención: Atendido hace 8 días");

    const fecha = screen.getByLabelText("Fecha de la visita");
    expect(fecha).toHaveAttribute("type", "date");
    expect(fecha).toHaveValue(hoyPanama());
    expect(fecha).toHaveAttribute("max", hoyPanama());
    expect(screen.getByLabelText("Brigadista responsable")).toHaveValue("Ana Brigadista");
    for (const label of ["¿Se entregó Agua?", "¿Se entregó Lona?", "¿Se entregaron Colchonetas?"]) {
      expect(within(screen.getByRole("radiogroup", { name: label })).getByRole("radio", { name: "No" })).toBeChecked();
    }
    expect(screen.getAllByRole("radiogroup")).toHaveLength(7);
    expect(screen.getByRole("group", { name: "Otros insumos entregados (opcional)" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Observaciones/)).toHaveValue("");
  });

  it("sin contacto usa «Registro» y los 8 primeros del id; sin atención no muestra la última", () => {
    mocks.useReporte.mockReturnValue({
      reporte: reporteGuardado({ contacto_nombre: null, estado: "PENDIENTE", attended_at: null }),
      loading: false,
    });
    montar();
    const contexto = screen.getByTestId("contexto-visita");
    expect(contexto).toHaveTextContent("Registro 5f0c7c1e");
    expect(contexto).not.toHaveTextContent("Última atención");
  });

  it("el último brigadista recordado gana al nombre del perfil", async () => {
    await db.meta.put({ key: META_ULTIMO_BRIGADISTA, value: "Carlos Ficticio" });
    montar();
    await waitFor(() => expect(screen.getByLabelText("Brigadista responsable")).toHaveValue("Carlos Ficticio"));
  });

  it("muestra un aviso con «Volver» si el reporte no existe", async () => {
    mocks.useReporte.mockReturnValue({ reporte: undefined, loading: false });
    const { user, onClose } = montar();
    expect(screen.getByText("No se encontró el reporte.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar visita" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Volver" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("mientras carga muestra un estado de carga", () => {
    mocks.useReporte.mockReturnValue({ reporte: undefined, loading: true });
    montar();
    expect(screen.getByRole("status")).toHaveTextContent("Cargando reporte…");
  });
});

describe("VisitaForm: validación", () => {
  it("una visita vacía no se guarda: mensaje sobre las entregas y foco en él", async () => {
    const { user } = montar();
    await user.click(screen.getByRole("button", { name: "Guardar visita" }));
    const alerta = screen.getByRole("alert");
    expect(alerta).toHaveTextContent(MSG_VISITA_VACIA);
    await waitFor(() => expect(alerta).toHaveFocus());
    const entregas = screen.getByRole("group", { name: "Entregas" });
    expect(entregas).toHaveAccessibleDescription(MSG_VISITA_VACIA);
    // El aviso va antes de la primera fila de entregas.
    const primera = screen.getByRole("radiogroup", { name: "¿Se entregó Agua?" });
    expect(alerta.compareDocumentPosition(primera) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(mocks.saveVisita).not.toHaveBeenCalled();

    // Una observación basta y el aviso desaparece.
    await user.type(screen.getByLabelText(/Observaciones/), "La familia no estaba");
    expect(screen.queryByText(MSG_VISITA_VACIA)).not.toBeInTheDocument();
    expect(await confirmar(user)).toBeInTheDocument();
  });

  it("observaciones solo con espacios cuentan como vacías", async () => {
    const { user } = montar();
    await user.type(screen.getByLabelText(/Observaciones/), "   ");
    await user.click(screen.getByRole("button", { name: "Guardar visita" }));
    expect(screen.getByRole("alert")).toHaveTextContent(MSG_VISITA_VACIA);
    expect(mocks.saveVisita).not.toHaveBeenCalled();
  });

  it("una fecha futura no se guarda: mensaje junto al campo y foco en él", async () => {
    const { user } = montar();
    await user.click(siEn("¿Se entregó Agua?"));
    const fecha = screen.getByLabelText("Fecha de la visita");
    fireEvent.change(fecha, { target: { value: fechaRelativa(2) } });
    await user.click(screen.getByRole("button", { name: "Guardar visita" }));
    expect(fecha).toHaveAttribute("aria-invalid", "true");
    expect(fecha).toHaveAccessibleDescription("La fecha de la visita no puede ser futura.");
    await waitFor(() => expect(fecha).toHaveFocus());
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(mocks.saveVisita).not.toHaveBeenCalled();
  });

  it("una fecha vacía muestra un error en español", async () => {
    const { user } = montar();
    await user.click(siEn("¿Se entregó Agua?"));
    const fecha = screen.getByLabelText("Fecha de la visita");
    fireEvent.change(fecha, { target: { value: "" } });
    await user.click(screen.getByRole("button", { name: "Guardar visita" }));
    expect(fecha).toHaveAccessibleDescription("Escribe una fecha válida.");
    expect(mocks.saveVisita).not.toHaveBeenCalled();
  });
});

describe("VisitaForm: guardar", () => {
  it("confirma y llama a saveVisita con el payload correcto", async () => {
    const { user, onSaved } = montar();
    const fecha = fechaRelativa(-2);
    fireEvent.change(screen.getByLabelText("Fecha de la visita"), { target: { value: fecha } });
    const brigadista = screen.getByLabelText("Brigadista responsable");
    await user.clear(brigadista);
    await user.type(brigadista, "  Beatriz Prueba ");
    await user.click(siEn("¿Se entregó Agua?"));
    await user.click(siEn("¿Se entregó Lona?"));
    await user.click(screen.getByRole("button", { name: "Ropa" }));
    await user.click(screen.getByRole("button", { name: "Frazadas" }));
    await user.type(screen.getByLabelText(/Observaciones/), " Segunda entrega ");

    const dialogo = await confirmar(user);
    expect(within(dialogo).getByRole("heading", { name: MENSAJES_VISITA.confirmar })).toBeInTheDocument();
    expect(dialogo).toHaveTextContent(`La familia volverá a aparecer como atendida el ${formatearFechaLarga(fecha)}.`);
    expect(mocks.saveVisita).not.toHaveBeenCalled();
    await user.click(within(dialogo).getByRole("button", { name: "Registrar visita" }));

    await waitFor(() => expect(mocks.saveVisita).toHaveBeenCalledOnce());
    expect(mocks.saveVisita.mock.calls[0][0]).toEqual({
      reporte_id: ID,
      fecha,
      brigadista_texto: "Beatriz Prueba",
      ent_agua: true,
      ent_kit_alimento: false,
      ent_kit_higiene: false,
      ent_lona: true,
      ent_camping: false,
      ent_toldas: false,
      ent_colchonetas: false,
      // Orden canónico de OTROS_INSUMOS.
      ent_otros: ["Frazadas", "Ropa"],
      observaciones: "Segunda entrega",
    });
    expect(mocks.toast).toHaveBeenCalledWith(MENSAJES_VISITA.pending);
    expect(onSaved).toHaveBeenCalledWith(VISITA_ID);
    // Recuerda el brigadista escrito (distinto del perfil).
    await waitFor(async () => expect((await db.meta.get(META_ULTIMO_BRIGADISTA))?.value).toBe("Beatriz Prueba"));
  });

  it("con la fecha de hoy la confirmación dice «atendida hoy»", async () => {
    const { user } = montar();
    await user.click(siEn("¿Se entregó Kit Alimento?"));
    const dialogo = await confirmar(user);
    expect(dialogo).toHaveTextContent("¿Registrar esta visita?");
    expect(dialogo).toHaveTextContent("La familia volverá a aparecer como atendida hoy.");
    expect(within(dialogo).getByRole("button", { name: "Seguir editando" })).toBeInTheDocument();
    await user.click(within(dialogo).getByRole("button", { name: "Seguir editando" }));
    expect(mocks.saveVisita).not.toHaveBeenCalled();
  });

  it("una fecha anterior a la última atención avisa que solo entra al historial", async () => {
    const { user } = montar();
    const fecha = fechaRelativa(-10);
    fireEvent.change(screen.getByLabelText("Fecha de la visita"), { target: { value: fecha } });
    await user.click(siEn("¿Se entregó Agua?"));
    const dialogo = await confirmar(user);
    expect(dialogo).toHaveTextContent(`La visita del ${formatearFechaLarga(fecha)} es anterior a la última atención`);
  });

  it("aviso «Visita registrada.» si quedó sincronizada", async () => {
    mocks.saveVisita.mockResolvedValue({ id: VISITA_ID, status: "synced" });
    const { user, onSaved } = montar();
    await user.click(screen.getByRole("button", { name: "Pañales Bebé" }));
    await user.click(within(await confirmar(user)).getByRole("button", { name: "Registrar visita" }));
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith(MENSAJES_VISITA.synced));
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalledWith(VISITA_ID);
  });

  it("aviso de error si saveVisita falla y permite reintentar", async () => {
    mocks.saveVisita.mockRejectedValueOnce(new Error("QuotaExceededError"));
    const { user, onSaved } = montar();
    await user.click(siEn("¿Se entregó Agua?"));
    await user.click(within(await confirmar(user)).getByRole("button", { name: "Registrar visita" }));
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith(MENSAJES_VISITA.error));
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Guardar visita" })).toBeEnabled();

    await user.click(within(await confirmar(user)).getByRole("button", { name: "Registrar visita" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(VISITA_ID));
    expect(mocks.saveVisita).toHaveBeenCalledTimes(2);
  });

  it("si el reporte se borró mientras tanto, lo dice", async () => {
    mocks.saveVisita.mockRejectedValueOnce(new Error("No se encontró el reporte de esta visita."));
    const { user } = montar();
    await user.click(siEn("¿Se entregó Agua?"));
    await user.click(within(await confirmar(user)).getByRole("button", { name: "Registrar visita" }));
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith("No se encontró el reporte de esta visita."));
  });

  it("no envía dos veces mientras guarda", async () => {
    let resolver: (v: { id: string; status: "synced" }) => void = () => {};
    mocks.saveVisita.mockReturnValue(new Promise((r) => (resolver = r)));
    const { user, onSaved } = montar();
    await user.click(siEn("¿Se entregó Agua?"));
    await user.click(within(await confirmar(user)).getByRole("button", { name: "Registrar visita" }));
    const boton = await screen.findByRole("button", { name: "Guardando…" });
    expect(boton).toBeDisabled();
    fireEvent.submit(boton.closest("form")!);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    resolver({ id: VISITA_ID, status: "synced" });
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(mocks.saveVisita).toHaveBeenCalledOnce();
  });
});

describe("VisitaForm: cerrar", () => {
  it("sin cambios cierra directamente", async () => {
    const { user, onClose, onDirtyChange } = montar();
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("con cambios pide confirmación para descartarlos", async () => {
    const { user, onClose, onDirtyChange } = montar();
    await user.click(siEn("¿Se entregó Lona?"));
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true));

    await user.click(screen.getByRole("button", { name: "Cerrar formulario" }));
    const dialogo = await screen.findByRole("alertdialog", { name: "¿Descartar los cambios?" });
    await user.click(within(dialogo).getByRole("button", { name: "Seguir editando" }));
    expect(onClose).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    await user.click(
      within(await screen.findByRole("alertdialog", { name: "¿Descartar los cambios?" })).getByRole("button", {
        name: "Descartar",
      }),
    );
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("cambiar solo la fecha también cuenta como cambio", async () => {
    const { onDirtyChange } = montar();
    fireEvent.change(screen.getByLabelText("Fecha de la visita"), { target: { value: fechaRelativa(-1) } });
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true));
  });
});
