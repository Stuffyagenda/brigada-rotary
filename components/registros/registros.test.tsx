import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { reporteFicticio } from "@/components/sheet/fixtures";
import { db } from "@/lib/db";
import { buscarRegistros } from "./buscar";
import { RegistrosScreen } from "./RegistrosScreen";

// La cabecera monta AccountMenu, que usa el router de Next.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/registros",
}));

const ana = reporteFicticio({
  id: "abcdef12-0000-4000-8000-000000000001",
  contacto_nombre: "Ana Prueba",
  contacto_telefono: "6000-0001",
  plus_code: "66VXXH6G+M5",
  updated_at: "2026-10-03T00:00:00Z",
});
const sinNombre = reporteFicticio({
  id: "99887766-0000-4000-8000-000000000002",
  brigadista_texto: "Brigadista Ficticio",
  _sync: "pending",
  updated_at: "2026-10-02T00:00:00Z",
});

describe("buscarRegistros", () => {
  it("busca por contacto, teléfono (con o sin guion), brigadista, Plus Code e id", () => {
    const todos = [ana, sinNombre];
    expect(buscarRegistros(todos, "ana")).toEqual([ana]);
    expect(buscarRegistros(todos, "60000001")).toEqual([ana]);
    expect(buscarRegistros(todos, "ficticio")).toEqual([sinNombre]);
    expect(buscarRegistros(todos, "h6g+m5")).toEqual([ana]);
    expect(buscarRegistros(todos, "99887766")).toEqual([sinNombre]);
    expect(buscarRegistros(todos, "  ")).toEqual(todos);
  });

  it('"pendiente" encuentra los reportes con estado Pendiente', () => {
    const atendido = reporteFicticio({
      id: "11223344-0000-4000-8000-000000000003",
      estado: "ATENDIDO",
      attended_at: "2026-10-02T00:00:00Z",
    });
    const pendiente = { ...ana, estado: "PENDIENTE" as const };
    expect(buscarRegistros([pendiente, atendido], "pendiente")).toEqual([pendiente]);
    expect(buscarRegistros([pendiente, atendido], "atendido")).toEqual([atendido]);
  });
});

const AHORA = new Date("2026-10-19T17:00:00Z");

describe("buscarRegistros por vigencia y fecha", () => {
  const vencido = reporteFicticio({
    id: "aaaa0001-0000-4000-8000-000000000010",
    estado: "ATENDIDO",
    attended_at: "2026-10-09T15:00:00Z",
    fecha_reporte: "2026-10-01",
  });
  const porVencer = reporteFicticio({
    id: "aaaa0002-0000-4000-8000-000000000011",
    estado: "ATENDIDO",
    attended_at: "2026-10-14T15:00:00Z",
    fecha_reporte: "2026-09-30",
  });
  const pendiente = reporteFicticio({ id: "aaaa0003-0000-4000-8000-000000000012", fecha_reporte: "2026-10-18" });
  const todos = [vencido, porVencer, pendiente];

  it("encuentra por la etiqueta de vigencia y el texto 'Atendido hace N días'", () => {
    expect(buscarRegistros(todos, "revisitar", AHORA)).toEqual([vencido]);
    expect(buscarRegistros(todos, "nueva visita", AHORA)).toEqual([vencido]);
    expect(buscarRegistros(todos, "7+", AHORA)).toEqual([vencido]);
    expect(buscarRegistros(todos, "4+ dias", AHORA)).toEqual([porVencer]);
    expect(buscarRegistros(todos, "hace 5 días", AHORA)).toEqual([porVencer]);
    expect(buscarRegistros(todos, "pendiente", AHORA)).toEqual([pendiente]);
  });

  it("encuentra por la fecha del reporte escrita en texto (no por unos pocos dígitos)", () => {
    expect(buscarRegistros(todos, "septiembre", AHORA)).toEqual([porVencer]);
    expect(buscarRegistros(todos, "18 de octubre", AHORA)).toEqual([pendiente]);
    expect(buscarRegistros(todos, "18", AHORA)).toEqual([]);
  });
});

describe("RegistrosScreen", () => {
  beforeEach(async () => {
    await db.reportes.clear();
  });

  it("muestra un estado vacío útil", async () => {
    render(<RegistrosScreen />);
    expect(await screen.findByText("Todavía no hay reportes en este celular.")).toBeInTheDocument();
    expect(screen.getByText("Con conexión, se descargan solos.")).toBeInTheDocument();
  });

  it("lista filas planas con acciones y filtra al buscar", async () => {
    await db.reportes.bulkPut([ana, sinNombre]);
    render(<RegistrosScreen />);
    expect(await screen.findByRole("heading", { name: "Ana Prueba" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Registro 99887766" })).toBeInTheDocument();
    expect(screen.getByText("Sin enviar")).toBeInTheDocument();
    const verEnMapa = screen.getAllByRole("link", { name: "Ver en mapa" });
    expect(verEnMapa[0]).toHaveAttribute("href", `/?reporte=${ana.id}`);
    expect(screen.getAllByRole("link", { name: "Editar" })[0]).toHaveAttribute("href", `/?reporte=${ana.id}&editar=1`);

    await userEvent.type(screen.getByRole("searchbox"), "Brigadista");
    expect(await screen.findByText("1 resultado")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Ana Prueba" })).not.toBeInTheDocument();
  });
});

describe("RegistrosScreen con vigencia", () => {
  beforeEach(async () => {
    await db.reportes.clear();
  });

  const DIA = 24 * 60 * 60 * 1000;
  const haceDias = (d: number) => new Date(Date.now() - d * DIA).toISOString();

  it("muestra la fecha del reporte, la vigencia con su glifo y filtra con los chips", async () => {
    const vencida = reporteFicticio({
      id: "bbbb0001-0000-4000-8000-000000000020",
      contacto_nombre: "Familia Vencida",
      estado: "ATENDIDO",
      attended_at: haceDias(10),
      fecha_reporte: "2026-09-01",
      updated_at: "2026-10-05T00:00:00Z",
    });
    const pendiente = reporteFicticio({
      id: "bbbb0002-0000-4000-8000-000000000021",
      contacto_nombre: "Familia Pendiente",
      fecha_reporte: "2026-09-02",
      updated_at: "2026-10-04T00:00:00Z",
    });
    await db.reportes.bulkPut([vencida, pendiente]);
    render(<RegistrosScreen />);

    expect(await screen.findByRole("heading", { name: "Familia Vencida" })).toBeInTheDocument();
    expect(screen.getByText("1 de septiembre de 2026")).toBeInTheDocument();
    const [filaVencida, filaPendiente] = screen.getAllByTestId("fila-vigencia");
    expect(filaVencida).toHaveTextContent("Atendido hace 10 días, necesita nueva visita");
    expect(within(filaVencida).getByTestId("glifo-vencido")).toBeInTheDocument();
    expect(filaPendiente).toHaveTextContent("Pendiente");
    expect(within(filaPendiente).getByTestId("glifo-pendiente")).toBeInTheDocument();

    const grupo = screen.getByRole("group", { name: "Filtrar por vigencia de la atención" });
    await userEvent.click(within(grupo).getByRole("button", { name: /^7\+ días/ }));
    expect(await screen.findByText("1 resultado")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Familia Pendiente" })).not.toBeInTheDocument();

    // La búsqueda se combina con el filtro.
    await userEvent.type(screen.getByRole("searchbox"), "pendiente");
    expect(await screen.findByText(/Ningún reporte coincide/)).toBeInTheDocument();
  });
});
