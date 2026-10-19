import { render, screen } from "@testing-library/react";
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
