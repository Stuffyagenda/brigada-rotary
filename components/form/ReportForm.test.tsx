import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { META_ULTIMO_BRIGADISTA } from "@/lib/brigadista";
import { db, type ReporteLocal } from "@/lib/db";
import { encodePlusCode } from "@/lib/pluscode";
import { reporteVacio } from "@/lib/types";
import { hoyPanama } from "@/lib/vigencia";

const mocks = vi.hoisted(() => ({
  saveReport: vi.fn(),
  getFotoPendiente: vi.fn(async () => undefined),
  getFotoUrl: vi.fn(async (): Promise<string | null> => null),
  useReporte: vi.fn(),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

vi.mock("@/lib/sync", () => ({
  saveReport: mocks.saveReport,
  getFotoPendiente: mocks.getFotoPendiente,
  getFotoUrl: mocks.getFotoUrl,
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

import { MENSAJES_GUARDADO, ReportForm } from "@/components/form/ReportForm";

const UBIC = { lat: 7.9616, lng: -80.4245 };
const ID = "5f0c7c1e-3b7a-4d1e-9a51-6f1f4f0f2a11";

function reporteGuardado(extra: Partial<ReporteLocal> = {}): ReporteLocal {
  return {
    ...reporteVacio(UBIC.lat, UBIC.lng),
    id: ID,
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-02T00:00:00.000Z",
    club_id: "22222222-2222-4222-8222-222222222222",
    brigadista_texto: "Luis",
    contacto_nombre: "Familia Pérez",
    contacto_telefono: "6968-0515",
    plus_code: "66VXXH6G+M5",
    attended_at: null,
    created_by: null,
    updated_by: null,
    total_personas: 0,
    _sync: "synced",
    ...extra,
  } as ReporteLocal;
}

function montar(props: Partial<Parameters<typeof ReportForm>[0]> = {}) {
  const handlers = {
    onClose: vi.fn(),
    onSaved: vi.fn(),
    onRequestPickLocation: vi.fn(),
  };
  const user = userEvent.setup();
  render(<ReportForm reporteId="nuevo" ubicacion={UBIC} {...handlers} {...props} />);
  return { user, ...handlers };
}

function seccion(nombre: string) {
  return screen.queryByRole("group", { name: new RegExp(`^${nombre}`) });
}

beforeEach(async () => {
  await db.meta.clear();
  mocks.saveReport.mockReset();
  mocks.saveReport.mockResolvedValue({ id: ID, status: "pending" });
  mocks.useReporte.mockReset();
  mocks.useReporte.mockReturnValue({ reporte: undefined, loading: false });
  mocks.toast.mockReset();
  mocks.toast.success.mockReset();
  mocks.toast.error.mockReset();
});

describe("ReportForm: secciones visibles", () => {
  it("PENDIENTE: necesidades y la casilla de entrega; la casilla abre las entregas", async () => {
    const { user } = montar();
    expect(seccion("Necesidades")).toBeInTheDocument();
    expect(seccion("Entregas")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("¿La familia tiene alguna necesidad pendiente?")).not.toBeInTheDocument();

    await user.click(screen.getByLabelText("¿Se hizo alguna entrega en esta visita?"));
    expect(seccion("Entregas")).toBeInTheDocument();
    expect(seccion("Necesidades")).toBeInTheDocument();
  });

  it("ATENDIDO: entregas y la casilla de necesidad; la casilla abre las necesidades", async () => {
    const { user } = montar();
    await user.click(screen.getByRole("radio", { name: "Atendido" }));
    expect(seccion("Entregas")).toBeInTheDocument();
    expect(seccion("Necesidades")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("¿Se hizo alguna entrega en esta visita?")).not.toBeInTheDocument();

    await user.click(screen.getByLabelText("¿La familia tiene alguna necesidad pendiente?"));
    expect(seccion("Necesidades")).toBeInTheDocument();
  });

  it("la franja de la cabecera cambia de estado", async () => {
    const { user } = montar();
    expect(screen.getByTestId("franja-estado")).toHaveAttribute("data-estado", "PENDIENTE");
    await user.click(screen.getByRole("radio", { name: "Atendido" }));
    expect(screen.getByTestId("franja-estado")).toHaveAttribute("data-estado", "ATENDIDO");
  });
});

describe("ReportForm: censo", () => {
  it("el total se actualiza en vivo (adultos + mayores + menores)", async () => {
    const { user } = montar();
    const total = screen.getByTestId("total-personas");
    expect(total).toHaveTextContent("0");
    await user.click(screen.getByRole("button", { name: "Sumar uno: Adultos (18 a 59)" }));
    await user.click(screen.getByRole("button", { name: "Sumar uno: Adultos (18 a 59)" }));
    await user.click(screen.getByRole("button", { name: "Sumar uno: Adultos Mayores (60+)" }));
    await user.click(screen.getByRole("button", { name: "Sumar uno: Menores / Niños / Bebés" }));
    await user.click(screen.getByRole("button", { name: "Sumar uno: Perros" }));
    await user.click(screen.getByRole("button", { name: "Sumar uno: Personas con Discapacidad" }));
    expect(total).toHaveTextContent("4");
  });

  it("las condiciones médicas solo aparecen con casos médicos y se limpian al volver a 0", async () => {
    const { user } = montar();
    expect(screen.queryByRole("group", { name: "Condiciones médicas" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Sumar uno: Casos Médicos / Heridos" }));
    const grupo = screen.getByRole("group", { name: "Condiciones médicas" });
    await user.click(within(grupo).getByRole("button", { name: "Hipertenso" }));
    expect(within(grupo).getByRole("button", { name: "Hipertenso" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Restar uno: Casos Médicos / Heridos" }));
    expect(screen.queryByRole("group", { name: "Condiciones médicas" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Sumar uno: Casos Médicos / Heridos" }));
    expect(screen.getByRole("button", { name: "Hipertenso" })).toHaveAttribute("aria-pressed", "false");
  });
});

describe("ReportForm: guardar", () => {
  it("no guarda sin ubicación y lleva el foco a «Elegir ubicación»", async () => {
    const { user, onRequestPickLocation } = montar({ ubicacion: null });
    expect(screen.getAllByText("Sin ubicación").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "Guardar reporte" }));
    expect(screen.getByRole("alert")).toHaveTextContent(MENSAJES_GUARDADO.sinUbicacion);
    const elegir = screen.getByRole("button", { name: /Elegir ubicación/ });
    await waitFor(() => expect(elegir).toHaveFocus());
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(mocks.saveReport).not.toHaveBeenCalled();
    await user.click(elegir);
    expect(onRequestPickLocation).toHaveBeenCalledOnce();
  });

  it("confirma y llama a saveReport con el payload correcto", async () => {
    const { user, onSaved } = montar();
    expect(screen.getByLabelText("Brigadista responsable")).toHaveValue("Ana Brigadista");
    await user.type(screen.getByLabelText("Nombre del jefe o jefa de hogar"), "  Familia Pérez ");
    await user.type(screen.getByLabelText("Teléfono o WhatsApp"), "6968-0515");
    await user.click(screen.getByRole("radio", { name: "Alta" }));
    await user.selectOptions(screen.getByLabelText("Daño de la vivienda"), "TOTAL / INHABITABLE");
    await user.click(screen.getByRole("button", { name: "Sumar uno: Adultos (18 a 59)" }));
    await user.click(within(screen.getByRole("radiogroup", { name: "Agua Potable" })).getByRole("radio", { name: "Sí" }));
    await user.click(screen.getByRole("button", { name: "Ropa" }));
    // Entrega en la misma visita.
    await user.click(screen.getByLabelText("¿Se hizo alguna entrega en esta visita?"));
    await user.click(
      within(screen.getByRole("radiogroup", { name: "¿Se entregó Lona?" })).getByRole("radio", { name: "Sí" }),
    );

    await user.click(screen.getByRole("button", { name: "Guardar reporte" }));
    const dialogo = await screen.findByRole("alertdialog");
    expect(dialogo).toHaveTextContent("¿Estás seguro de que deseas guardar este nuevo reporte?");
    expect(mocks.saveReport).not.toHaveBeenCalled();
    await user.click(within(dialogo).getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(mocks.saveReport).toHaveBeenCalledOnce());
    const [payload, foto] = mocks.saveReport.mock.calls[0];
    expect(foto).toBeNull();
    expect(payload).toMatchObject({
      lat: UBIC.lat,
      lng: UBIC.lng,
      plus_code: encodePlusCode(UBIC.lat, UBIC.lng),
      estado: "PENDIENTE",
      attended_at: null,
      prioridad: "ALTA",
      danio_vivienda: "TOTAL / INHABITABLE",
      brigadista_texto: "Ana Brigadista",
      club_id: "11111111-1111-4111-8111-111111111111",
      contacto_nombre: "Familia Pérez",
      contacto_telefono: "6968-0515",
      adultos: 1,
      nec_agua: true,
      nec_lona: false,
      nec_otros: ["Ropa"],
      ent_lona: true,
      ent_agua: false,
      ent_otros: [],
      condiciones_medicas: [],
      observaciones_atencion: null,
    });
    expect(payload.id).toBeUndefined();
    expect(mocks.toast).toHaveBeenCalledWith(MENSAJES_GUARDADO.pending);
    expect(onSaved).toHaveBeenCalledWith(ID, "PENDIENTE");
  });

  it("ATENDIDO: fija attended_at y vacía las necesidades si no se marcó la casilla", async () => {
    mocks.saveReport.mockResolvedValue({ id: ID, status: "synced" });
    const { user, onSaved } = montar();
    await user.click(within(screen.getByRole("radiogroup", { name: "Agua Potable" })).getByRole("radio", { name: "Sí" }));
    await user.click(screen.getByRole("radio", { name: "Atendido" }));
    await user.click(
      within(screen.getByRole("radiogroup", { name: "¿Se entregó Agua?" })).getByRole("radio", { name: "Sí" }),
    );
    await user.type(screen.getByLabelText(/Observaciones de la atención/), "Se entregó agua");
    await user.click(screen.getByRole("button", { name: "Guardar reporte" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(mocks.saveReport).toHaveBeenCalledOnce());
    const [payload] = mocks.saveReport.mock.calls[0];
    expect(payload.estado).toBe("ATENDIDO");
    expect(typeof payload.attended_at).toBe("string");
    expect(payload.nec_agua).toBe(false);
    expect(payload.ent_agua).toBe(true);
    expect(payload.observaciones_atencion).toBe("Se entregó agua");
    expect(mocks.toast.success).toHaveBeenCalledWith(MENSAJES_GUARDADO.synced);
    expect(onSaved).toHaveBeenCalledWith(ID, "ATENDIDO");
  });

  it("muestra el aviso de error si saveReport falla y permite reintentar", async () => {
    mocks.saveReport.mockRejectedValueOnce(new Error("QuotaExceededError"));
    const { user, onSaved } = montar();
    await user.click(screen.getByRole("button", { name: "Guardar reporte" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith(MENSAJES_GUARDADO.error));
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Guardar reporte" })).toBeEnabled();
  });

  it("valida el teléfono con un mensaje junto al campo y le da el foco", async () => {
    const { user } = montar();
    const tel = screen.getByLabelText("Teléfono o WhatsApp");
    await user.type(tel, "llamar al vecino");
    await user.click(screen.getByRole("button", { name: "Guardar reporte" }));
    expect(tel).toHaveAttribute("aria-invalid", "true");
    expect(tel).toHaveAccessibleDescription(/solo con números/);
    await waitFor(() => expect(tel).toHaveFocus());
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(mocks.saveReport).not.toHaveBeenCalled();
  });
});

describe("ReportForm: edición", () => {
  it("carga el reporte y abre las secciones según sus datos", () => {
    mocks.useReporte.mockReturnValue({
      reporte: reporteGuardado({ estado: "ATENDIDO", attended_at: "2026-10-03T00:00:00.000Z", nec_lona: true }),
      loading: false,
    });
    montar({ reporteId: ID });
    expect(screen.getByRole("heading", { name: "Editar reporte" })).toBeInTheDocument();
    expect(screen.getByLabelText("Nombre del jefe o jefa de hogar")).toHaveValue("Familia Pérez");
    expect(screen.getByLabelText("¿La familia tiene alguna necesidad pendiente?")).toBeChecked();
    expect(seccion("Necesidades")).toBeInTheDocument();
    expect(seccion("Entregas")).toBeInTheDocument();
  });

  it("sin cambios: pregunta si guardar de todos modos", async () => {
    mocks.useReporte.mockReturnValue({ reporte: reporteGuardado(), loading: false });
    const { user } = montar({ reporteId: ID });
    await user.click(screen.getByRole("button", { name: "Guardar reporte" }));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent(
      "No se detectaron cambios en los datos. ¿Deseas guardar de todos modos?",
    );
  });

  it("cambio del formulario", async () => {
    mocks.useReporte.mockReturnValue({ reporte: reporteGuardado(), loading: false });
    const { user } = montar({ reporteId: ID });
    await user.click(screen.getByRole("radio", { name: "Baja" }));
    await user.click(screen.getByRole("button", { name: "Guardar reporte" }));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent(
      "¿Estás seguro de realizar los cambios del formulario?",
    );
  });

  it("cambio de ubicación y de ambos", async () => {
    mocks.useReporte.mockReturnValue({ reporte: reporteGuardado(), loading: false });
    const { user } = montar({ reporteId: ID, ubicacion: { lat: 7.97, lng: -80.43 } });
    await user.click(screen.getByRole("button", { name: "Guardar reporte" }));
    const dialogo = await screen.findByRole("alertdialog");
    expect(dialogo).toHaveTextContent("¿Estás seguro de cambiar la ubicación de este registro?");
    await user.click(within(dialogo).getByRole("button", { name: "Seguir editando" }));

    await user.click(screen.getByRole("button", { name: "Sumar uno: Gatos" }));
    await user.click(screen.getByRole("button", { name: "Guardar reporte" }));
    await waitFor(() =>
      expect(screen.getByRole("alertdialog")).toHaveTextContent(
        "¿Estás seguro de cambiar la ubicación y realizar también los cambios del formulario?",
      ),
    );
  });

  it("al guardar conserva id, club y fecha de creación del reporte", async () => {
    mocks.useReporte.mockReturnValue({ reporte: reporteGuardado(), loading: false });
    const { user } = montar({ reporteId: ID });
    await user.click(screen.getByRole("button", { name: "Guardar reporte" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(mocks.saveReport).toHaveBeenCalledOnce());
    expect(mocks.saveReport.mock.calls[0][0]).toMatchObject({
      id: ID,
      club_id: "22222222-2222-4222-8222-222222222222",
      created_at: "2026-10-01T00:00:00.000Z",
      brigadista_texto: "Luis",
    });
  });

  it("muestra un aviso si el reporte no existe", () => {
    montar({ reporteId: ID });
    expect(screen.getByText("No se encontró el reporte.")).toBeInTheDocument();
  });
});

describe("ReportForm: foto guardada", () => {
  it("al editar previsualiza la foto de Storage con getFotoUrl", async () => {
    mocks.getFotoUrl.mockResolvedValueOnce("https://firmada.test/foto.jpg?token=x");
    mocks.useReporte.mockReturnValue({
      reporte: reporteGuardado({ foto_path: `${ID}/f.jpg` }),
      loading: false,
    });
    montar({ reporteId: ID });
    const img = await screen.findByRole("img", { name: "Foto guardada de la vivienda" });
    expect(img).toHaveAttribute("src", "https://firmada.test/foto.jpg?token=x");
    expect(mocks.getFotoUrl).toHaveBeenCalledWith({ id: ID, foto_path: `${ID}/f.jpg`, foto_url: null });
  });

  it("sin señal indica que la foto existe aunque no se pueda ver", async () => {
    mocks.getFotoUrl.mockResolvedValueOnce(null);
    mocks.useReporte.mockReturnValue({ reporte: reporteGuardado({ foto_path: `${ID}/f.jpg` }), loading: false });
    montar({ reporteId: ID });
    expect(await screen.findByText("Foto guardada. Necesitas conexión para verla.")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Foto guardada de la vivienda" })).not.toBeInTheDocument();
  });
});

describe("ReportForm: brigadista recordado", () => {
  async function guardar(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: "Guardar reporte" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(mocks.saveReport).toHaveBeenCalled());
  }

  async function recordado() {
    return (await db.meta.get(META_ULTIMO_BRIGADISTA))?.value;
  }

  it("el último brigadista escrito gana al nombre del perfil en un reporte nuevo", async () => {
    await db.meta.put({ key: META_ULTIMO_BRIGADISTA, value: "Carlos Ficticio" });
    montar();
    await waitFor(() => expect(screen.getByLabelText("Brigadista responsable")).toHaveValue("Carlos Ficticio"));
  });

  it("recuerda un nombre distinto al del perfil y lo usa en el siguiente reporte", async () => {
    const { user } = montar();
    const campo = screen.getByLabelText("Brigadista responsable");
    await user.clear(campo);
    await user.type(campo, "Beatriz Prueba");
    await guardar(user);
    await waitFor(async () => expect(await recordado()).toBe("Beatriz Prueba"));

    cleanup();
    montar();
    await waitFor(() => expect(screen.getByLabelText("Brigadista responsable")).toHaveValue("Beatriz Prueba"));
  });

  it("si vuelve a escribir el nombre del perfil, se olvida el recordado", async () => {
    await db.meta.put({ key: META_ULTIMO_BRIGADISTA, value: "Carlos Ficticio" });
    const { user } = montar();
    const campo = screen.getByLabelText("Brigadista responsable");
    await waitFor(() => expect(campo).toHaveValue("Carlos Ficticio"));
    await user.clear(campo);
    await user.type(campo, "Ana Brigadista");
    await guardar(user);
    await waitFor(async () => expect(await recordado()).toBeUndefined());
  });

  it("al editar sin tocar el campo no adopta el brigadista del reporte", async () => {
    mocks.useReporte.mockReturnValue({ reporte: reporteGuardado(), loading: false });
    const { user } = montar({ reporteId: ID });
    expect(screen.getByLabelText("Brigadista responsable")).toHaveValue("Luis");
    await guardar(user);
    // Da tiempo a una escritura que no debe ocurrir.
    await new Promise((r) => setTimeout(r, 20));
    expect(await recordado()).toBeUndefined();
  });
});

describe("ReportForm: cerrar", () => {
  it("sin cambios cierra directamente", async () => {
    const { user, onClose } = montar();
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("con cambios pide confirmación para descartarlos", async () => {
    const { user, onClose } = montar();
    await user.type(screen.getByLabelText("Nombre del jefe o jefa de hogar"), "Familia Gómez");
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
});

describe("ReportForm: fecha del reporte", () => {
  const DIA = 24 * 60 * 60 * 1000;
  const fechaRelativa = (dias: number) => hoyPanama(new Date(Date.now() + dias * DIA));

  it("al crear, por defecto es hoy (Panamá) y no deja elegir días futuros", () => {
    montar();
    const fecha = screen.getByLabelText("Fecha del reporte");
    expect(fecha).toHaveAttribute("type", "date");
    expect(fecha).toHaveValue(hoyPanama());
    expect(fecha).toHaveAttribute("max", hoyPanama());
  });

  it("al editar muestra la fecha guardada y la envía en el payload", async () => {
    const guardada = fechaRelativa(-5);
    mocks.useReporte.mockReturnValue({ reporte: reporteGuardado({ fecha_reporte: guardada }), loading: false });
    const { user } = montar({ reporteId: ID });
    expect(screen.getByLabelText("Fecha del reporte")).toHaveValue(guardada);
    await user.click(screen.getByRole("button", { name: "Guardar reporte" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(mocks.saveReport).toHaveBeenCalledOnce());
    expect(mocks.saveReport.mock.calls[0][0].fecha_reporte).toBe(guardada);
  });

  it("una fecha futura no se guarda: mensaje junto al campo y foco en él", async () => {
    const { user } = montar();
    const fecha = screen.getByLabelText("Fecha del reporte");
    fireEvent.change(fecha, { target: { value: fechaRelativa(2) } });
    await user.click(screen.getByRole("button", { name: "Guardar reporte" }));
    expect(fecha).toHaveAttribute("aria-invalid", "true");
    expect(fecha).toHaveAccessibleDescription("La fecha del reporte no puede ser futura.");
    await waitFor(() => expect(fecha).toHaveFocus());
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(mocks.saveReport).not.toHaveBeenCalled();

    // Al corregirla desaparece el error y se puede guardar.
    fireEvent.change(fecha, { target: { value: fechaRelativa(-1) } });
    expect(fecha).not.toHaveAttribute("aria-invalid");
    await user.click(screen.getByRole("button", { name: "Guardar reporte" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(mocks.saveReport).toHaveBeenCalledOnce());
    expect(mocks.saveReport.mock.calls[0][0].fecha_reporte).toBe(fechaRelativa(-1));
  });

  it("una fecha vacía o inválida muestra un error en español", async () => {
    const { user } = montar();
    const fecha = screen.getByLabelText("Fecha del reporte");
    fireEvent.change(fecha, { target: { value: "" } });
    await user.click(screen.getByRole("button", { name: "Guardar reporte" }));
    expect(fecha).toHaveAccessibleDescription("Escribe una fecha válida.");
    expect(mocks.saveReport).not.toHaveBeenCalled();
  });

  it("cambiar la fecha cuenta como cambio del formulario y al cerrar pide descartar", async () => {
    mocks.useReporte.mockReturnValue({ reporte: reporteGuardado(), loading: false });
    const onDirtyChange = vi.fn();
    const { user, onClose } = montar({ reporteId: ID, onDirtyChange });
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    fireEvent.change(screen.getByLabelText("Fecha del reporte"), { target: { value: fechaRelativa(-3) } });
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true));

    await user.click(screen.getByRole("button", { name: "Guardar reporte" }));
    const dialogo = await screen.findByRole("alertdialog");
    expect(dialogo).toHaveTextContent("¿Estás seguro de realizar los cambios del formulario?");
    await user.click(within(dialogo).getByRole("button", { name: "Seguir editando" }));

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(await screen.findByRole("alertdialog", { name: "¿Descartar los cambios?" })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
