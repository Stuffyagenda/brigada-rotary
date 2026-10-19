import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  avisoGuardado,
  bloqueoPropio,
  confirmacionNecesaria,
  nombreVisible,
  ordenarMiembros,
  type Miembro,
} from "@/components/admin/members-data";
import type { ProfileContextValue } from "@/lib/auth/profile";

const yo: Miembro = {
  id: "u1",
  nombre: "Ana",
  apellido: "Pérez",
  nombre_completo: "Ana Pérez",
  club_id: "c1",
  rol: "admin",
  activo: true,
};
const otro: Miembro = {
  id: "u2",
  nombre: "Beto",
  apellido: "Ruiz",
  nombre_completo: "Beto Ruiz",
  club_id: null,
  rol: "admin",
  activo: true,
};
// Perfil anterior a la migración 003: el nombre completo quedó en `nombre`, sin apellido.
const antiguo: Miembro = {
  id: "u3",
  nombre: "Carla Gómez",
  apellido: null,
  nombre_completo: "Carla Gómez",
  club_id: null,
  rol: "miembro",
  activo: true,
};
const clubs = [{ id: "c1", nombre: "Rotary Club Panamá", tipo: "rotary" as const }];

describe("reglas de miembros", () => {
  it("bloquea que un admin se quite el rol o se desactive a sí mismo", () => {
    expect(bloqueoPropio("u1", yo, { rol: "miembro" })?.title).toMatch(/quitarte el rol/);
    expect(bloqueoPropio("u1", yo, { activo: false })?.title).toMatch(/desactivar tu propio acceso/);
    expect(bloqueoPropio("u1", yo, { club_id: null })).toBeNull();
    expect(bloqueoPropio("u1", otro, { rol: "miembro" })).toBeNull();
  });

  it("pide confirmación al desactivar o quitar el rol a otro", () => {
    expect(confirmacionNecesaria(otro, { activo: false })?.confirmLabel).toBe("Desactivar acceso");
    expect(confirmacionNecesaria(otro, { rol: "miembro" })?.confirmLabel).toBe("Quitar rol");
    expect(confirmacionNecesaria(otro, { activo: true })).toBeNull();
    expect(confirmacionNecesaria(otro, { club_id: "c1" })).toBeNull();
  });

  it("ordena por nombre y apellido con los vacíos al final", () => {
    const lista = ordenarMiembros([
      { nombre: null, apellido: null, nombre_completo: null },
      { nombre: "Zoe", apellido: "Arias" },
      { nombre: "álvaro", apellido: "Zapata" },
      { nombre: null, apellido: null, nombre_completo: "Beto Ruiz" },
    ]);
    expect(lista.map((m) => nombreVisible(m))).toEqual(["álvaro Zapata", "Beto Ruiz", "Zoe Arias", "Sin nombre"]);
  });

  it("muestra nombre y apellido, o el nombre completo de un perfil antiguo", () => {
    expect(nombreVisible(yo)).toBe("Ana Pérez");
    expect(nombreVisible({ ...yo, nombre_completo: "Otro" })).toBe("Ana Pérez");
    expect(nombreVisible(antiguo)).toBe("Carla Gómez");
    expect(nombreVisible({ nombre: " ", apellido: null, nombre_completo: "Legado" })).toBe("Legado");
    expect(nombreVisible({ nombre: null, apellido: null, nombre_completo: null })).toBe("Sin nombre");
  });

  it("redacta el aviso según el cambio", () => {
    expect(avisoGuardado(otro, { activo: false }, clubs)).toBe("Acceso de Beto Ruiz desactivado.");
    expect(avisoGuardado(otro, { rol: "miembro" }, clubs)).toBe("Rol de Beto Ruiz: Miembro.");
    expect(avisoGuardado(otro, { club_id: "c1" }, clubs)).toBe("Beto Ruiz ahora es de Rotary Club Panamá.");
    expect(avisoGuardado(otro, { nombre: "Beto", apellido: "Ruiz" }, clubs)).toBe("Datos de Beto Ruiz guardados.");
  });
});

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { success: toastSuccess, error: toastError } }));

const updates: Array<{ id: string; cambio: unknown }> = [];
let filas: Miembro[] = [];

function fakeClient() {
  return {
    from(tabla: string) {
      if (tabla === "clubs") {
        return { select: () => ({ order: async () => ({ data: clubs, error: null }) }) };
      }
      return {
        select: async () => ({ data: filas, error: null }),
        update: (cambio: Partial<Miembro>) => ({
          eq: (_col: string, id: string) => ({
            select: () => ({
              maybeSingle: async () => {
                updates.push({ id, cambio });
                const fila = filas.find((f) => f.id === id);
                return { data: fila ? { ...fila, ...cambio } : null, error: null };
              },
            }),
          }),
        }),
      };
    },
  };
}
vi.mock("@/lib/supabase/client", () => ({ getSupabaseBrowserClient: () => fakeClient() }));

let perfilActual: Partial<ProfileContextValue>;
vi.mock("@/lib/auth/profile", () => ({ useProfile: () => perfilActual }));

const { MembersAdmin } = await import("@/components/admin/MembersAdmin");

describe("MembersAdmin", () => {
  beforeEach(() => {
    updates.length = 0;
    filas = [yo, otro];
    toastSuccess.mockReset();
    toastError.mockReset();
    perfilActual = {
      profile: { ...yo, nombre: null, apellido: null, created_at: "x", updated_at: "x" },
      isAdmin: true,
      loading: false,
      refresh: vi.fn(async () => {}),
    };
  });

  it("a un miembro le muestra un aviso y el enlace al mapa", () => {
    perfilActual = { ...perfilActual, isAdmin: false };
    render(<MembersAdmin />);
    expect(screen.getByText("Esta página es solo para administradores.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Volver al mapa" })).toHaveAttribute("href", "/");
  });

  it("lista los miembros con nombre y apellido, club, rol y acceso, sin emails", async () => {
    render(<MembersAdmin />);
    const lista = await screen.findByRole("list", { name: "Lista de miembros" });
    const items = within(lista).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText("Ana Pérez")).toBeInTheDocument();
    expect(within(items[1]).getByText("Beto Ruiz")).toBeInTheDocument();
    expect(within(items[0]).getByText("(tú)")).toBeInTheDocument();
    expect(within(items[0]).getByLabelText("Club")).toHaveValue("c1");
    expect(within(items[1]).getByRole("switch", { name: "Acceso de Beto Ruiz" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByText(/Cada persona crea su cuenta en la pantalla de registro/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/@/);
  });

  it("impide que el admin se desactive a sí mismo y no envía nada", async () => {
    render(<MembersAdmin />);
    await userEvent.click(await screen.findByRole("switch", { name: "Acceso de Ana Pérez" }));
    const dialogo = await screen.findByRole("alertdialog");
    expect(within(dialogo).getByText("No puedes desactivar tu propio acceso")).toBeInTheDocument();
    await userEvent.click(within(dialogo).getByRole("button", { name: "Entendido" }));
    expect(updates).toHaveLength(0);
    expect(screen.getByRole("switch", { name: "Acceso de Ana Pérez" })).toHaveAttribute("aria-checked", "true");
  });

  it("impide que el admin se quite el rol", async () => {
    render(<MembersAdmin />);
    const lista = await screen.findByRole("list", { name: "Lista de miembros" });
    const fila = within(lista).getAllByRole("listitem")[0];
    await userEvent.selectOptions(within(fila).getByLabelText("Rol"), "miembro");
    expect(await screen.findByText("No puedes quitarte el rol de administrador")).toBeInTheDocument();
    expect(updates).toHaveLength(0);
    expect(within(fila).getByLabelText("Rol")).toHaveValue("admin");
  });

  it("desactiva a otro miembro tras confirmar", async () => {
    render(<MembersAdmin />);
    await userEvent.click(await screen.findByRole("switch", { name: "Acceso de Beto Ruiz" }));
    const dialogo = await screen.findByRole("alertdialog");
    await userEvent.click(within(dialogo).getByRole("button", { name: "Desactivar acceso" }));
    expect(updates).toEqual([{ id: "u2", cambio: { activo: false } }]);
    expect(await screen.findByRole("switch", { name: "Acceso de Beto Ruiz" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(toastSuccess).toHaveBeenCalledWith("Acceso de Beto Ruiz desactivado.");
  });

  it("cambia el club sin confirmación", async () => {
    render(<MembersAdmin />);
    const lista = await screen.findByRole("list", { name: "Lista de miembros" });
    const fila = within(lista).getAllByRole("listitem")[1];
    await userEvent.selectOptions(within(fila).getByLabelText("Club"), "c1");
    expect(updates).toEqual([{ id: "u2", cambio: { club_id: "c1" } }]);
    expect(toastSuccess).toHaveBeenCalledWith("Beto Ruiz ahora es de Rotary Club Panamá.");
  });

  it("marca a un perfil antiguo sin apellido", async () => {
    filas = [yo, antiguo];
    render(<MembersAdmin />);
    const lista = await screen.findByRole("list", { name: "Lista de miembros" });
    const fila = within(lista).getAllByRole("listitem")[1];
    expect(within(fila).getByText("Carla Gómez")).toBeInTheDocument();
    expect(within(fila).getByText("Sin apellido")).toBeInTheDocument();
  });

  it("edita el nombre y apellido de otro miembro", async () => {
    filas = [yo, antiguo];
    render(<MembersAdmin />);
    await userEvent.click(await screen.findByRole("button", { name: "Editar nombre de Carla Gómez" }));
    const dialogo = await screen.findByRole("dialog", { name: "Editar nombre de Carla Gómez" });
    const nombre = within(dialogo).getByLabelText("Nombre");
    const apellido = within(dialogo).getByLabelText("Apellido");
    expect(nombre).toHaveValue("Carla Gómez");
    expect(apellido).toHaveValue("");

    // Sin apellido no se guarda.
    await userEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    expect(within(dialogo).getByText("Escribe el apellido.")).toBeInTheDocument();
    expect(apellido).toHaveAttribute("aria-invalid", "true");
    expect(apellido).toHaveFocus();
    expect(updates).toHaveLength(0);

    await userEvent.clear(nombre);
    await userEvent.type(nombre, "Carla");
    await userEvent.type(apellido, " Gómez ");
    await userEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    expect(updates).toEqual([{ id: "u3", cambio: { nombre: "Carla", apellido: "Gómez" } }]);
    expect(toastSuccess).toHaveBeenCalledWith("Datos de Carla Gómez guardados.");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const fila = within(screen.getByRole("list", { name: "Lista de miembros" })).getAllByRole("listitem")[1];
    expect(within(fila).queryByText("Sin apellido")).not.toBeInTheDocument();
  });

  it("si falla al guardar el nombre, el diálogo sigue abierto con el error", async () => {
    filas = [yo, otro];
    render(<MembersAdmin />);
    await userEvent.click(await screen.findByRole("button", { name: "Editar nombre de Beto Ruiz" }));
    const dialogo = await screen.findByRole("dialog");
    filas = []; // la fila ya no existe: 0 filas actualizadas (RLS)
    await userEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    expect(await within(dialogo).findByText("Solo un administrador activo puede hacer este cambio.")).toBeInTheDocument();
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});
