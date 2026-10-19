import { AuthApiError } from "@supabase/supabase-js";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProfileContextValue } from "@/lib/auth/profile";
import type { Profile } from "@/lib/types";

const replace = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh, push: vi.fn() }),
  usePathname: () => "/",
}));

const signInWithPassword = vi.fn();
const getSession = vi.fn(async () => ({ data: { session: null }, error: null }));
// `from('profiles').update(cambio).eq('id', id).select('id').maybeSingle()`
const perfilUpdates: Array<{ id: string; cambio: unknown }> = [];
let respuestaUpdate: { data: unknown; error: unknown } = { data: { id: "u1" }, error: null };
const from = vi.fn(() => ({
  update: (cambio: unknown) => ({
    eq: (_col: string, id: string) => ({
      select: () => ({
        maybeSingle: async () => {
          perfilUpdates.push({ id, cambio });
          return respuestaUpdate;
        },
      }),
    }),
  }),
}));
vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => ({ auth: { signInWithPassword, getSession }, from }),
}));

const toastSuccess = vi.fn();
vi.mock("sonner", () => ({ toast: { success: toastSuccess, error: vi.fn() } }));

vi.mock("@/lib/env", () => ({ hasSupabaseEnv: () => true }));

let perfilActual: ProfileContextValue;
vi.mock("@/lib/auth/profile", () => ({ useProfile: () => perfilActual }));

const { LoginForm } = await import("@/components/auth/LoginForm");
const { AccountMenu, initials } = await import("@/components/auth/AccountMenu");
const { SessionGate, gateView } = await import("@/components/auth/SessionGate");
const { default: LoginPage } = await import("@/app/(auth)/login/page");

const profile: Profile = {
  id: "u1",
  nombre: "Ana María",
  apellido: "Pérez",
  nombre_completo: "Ana María Pérez",
  club_id: "c1",
  rol: "admin",
  activo: true,
  estado_aprobacion: "aprobado",
  created_at: "x",
  updated_at: "x",
};

function perfil(over: Partial<ProfileContextValue> = {}): ProfileContextValue {
  return {
    profile,
    club: { id: "c1", nombre: "Rotary Club Panamá", tipo: "rotary", provincia: null, created_at: "x" },
    isAdmin: true,
    loading: false,
    status: "signed-in",
    session: null,
    email: "ana@example.org",
    offline: false,
    refresh: vi.fn(async () => {}),
    signOut: vi.fn(async () => {}),
    ...over,
  };
}

beforeEach(() => {
  replace.mockReset();
  refresh.mockReset();
  signInWithPassword.mockReset();
  toastSuccess.mockReset();
  perfilUpdates.length = 0;
  respuestaUpdate = { data: { id: "u1" }, error: null };
  perfilActual = perfil();
});

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("LoginForm", () => {
  it("tiene campos etiquetados con autocompletado correcto", () => {
    render(<LoginForm />);
    expect(screen.getByLabelText("Correo electrónico")).toHaveAttribute("autocomplete", "email");
    expect(screen.getByLabelText("Contraseña")).toHaveAttribute("autocomplete", "current-password");
    expect(screen.getByText("¿Olvidaste tu contraseña? Pídela a un administrador de tu club.")).toBeInTheDocument();
  });

  it("muestra un error claro con credenciales incorrectas", async () => {
    signInWithPassword.mockResolvedValue({
      data: {},
      error: new AuthApiError("Invalid login credentials", 400, "invalid_credentials"),
    });
    render(<LoginForm />);
    await userEvent.type(screen.getByLabelText("Correo electrónico"), "ana@example.org");
    await userEvent.type(screen.getByLabelText("Contraseña"), "mala");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByText("Correo o contraseña incorrectos.")).toBeInTheDocument();
    expect(screen.getByLabelText("Contraseña")).toHaveAttribute("aria-invalid", "true");
    expect(replace).not.toHaveBeenCalled();
  });

  it("entra y redirige al next interno", async () => {
    window.history.replaceState(null, "", "/login?next=%2Fregistros");
    signInWithPassword.mockResolvedValue({ data: {}, error: null });
    render(<LoginForm />);
    await userEvent.type(screen.getByLabelText("Correo electrónico"), "ana@example.org");
    await userEvent.type(screen.getByLabelText("Contraseña"), "buena");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));
    expect(signInWithPassword).toHaveBeenCalledWith({ email: "ana@example.org", password: "buena" });
    expect(replace).toHaveBeenCalledWith("/registros");
  });

  it("ignora un next externo", async () => {
    window.history.replaceState(null, "", "/login?next=https%3A%2F%2Fevil.example");
    signInWithPassword.mockResolvedValue({ data: {}, error: null });
    render(<LoginForm />);
    await userEvent.type(screen.getByLabelText("Correo electrónico"), "ana@example.org");
    await userEvent.type(screen.getByLabelText("Contraseña"), "buena");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));
    expect(replace).toHaveBeenCalledWith("/");
  });

  it("sin red avisa que el primer inicio necesita internet", async () => {
    const spy = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    render(<LoginForm />);
    await userEvent.type(screen.getByLabelText("Correo electrónico"), "ana@example.org");
    await userEvent.type(screen.getByLabelText("Contraseña"), "x");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByText("Sin conexión. El primer inicio de sesión necesita internet.")).toBeInTheDocument();
    expect(signInWithPassword).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("LoginPage", () => {
  it("enlaza a /registro", () => {
    render(<LoginPage />);
    expect(screen.getByText("¿No tienes cuenta?")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Crear cuenta" })).toHaveAttribute("href", "/registro");
  });

  it("conserva el next interno al ir a /registro", () => {
    window.history.replaceState(null, "", "/login?next=%2Fregistros");
    render(<LoginPage />);
    expect(screen.getByRole("link", { name: "Crear cuenta" })).toHaveAttribute(
      "href",
      "/registro?next=%2Fregistros",
    );
  });
});

describe("gateView", () => {
  const base = { profile, offline: false };
  it("decide según la sesión y el perfil", () => {
    expect(gateView({ ...base, status: "signed-out" })).toBe("redirect");
    expect(gateView({ ...base, status: "signed-in" })).toBe("app");
    expect(gateView({ ...base, status: "signed-in", profile: { ...profile, activo: false } })).toBe("inactive");
    expect(gateView({ ...base, status: "signed-in", profile: { ...profile, activo: false, estado_aprobacion: "pendiente" } })).toBe("pending");
    expect(gateView({ ...base, status: "signed-in", profile: { ...profile, activo: false, estado_aprobacion: "rechazado" } })).toBe("rejected");
    expect(
      gateView({
        ...base,
        status: "signed-in",
        profile: { ...profile, estado_aprobacion: undefined } as unknown as Profile,
      }),
    ).toBe("approval-unavailable");
    expect(gateView({ ...base, status: "loading", profile: null })).toBe("loading");
    expect(gateView({ ...base, status: "loading" })).toBe("app");
    expect(gateView({ ...base, status: "signed-in", profile: null })).toBe("no-profile");
    // Sin perfil verificado, incluso sin red no se puede entrar.
    expect(gateView({ status: "signed-in", profile: null, offline: true })).toBe("loading");
  });
});

describe("SessionGate", () => {
  it("muestra la app con sesión", () => {
    render(<SessionGate>contenido</SessionGate>);
    expect(screen.getByText("contenido")).toBeInTheDocument();
  });

  it("redirige a /login sin sesión", () => {
    perfilActual = perfil({ status: "signed-out", profile: null });
    render(<SessionGate>contenido</SessionGate>);
    expect(screen.queryByText("contenido")).not.toBeInTheDocument();
    expect(replace).toHaveBeenCalledWith("/login");
  });

  it("bloquea a un miembro desactivado y permite cerrar sesión", async () => {
    const signOut = vi.fn(async () => {});
    perfilActual = perfil({ profile: { ...profile, activo: false }, signOut });
    render(<SessionGate>contenido</SessionGate>);
    expect(screen.getByText("Tu acceso está desactivado.")).toBeInTheDocument();
    expect(screen.getByText("Habla con un administrador.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cerrar sesión" }));
    expect(signOut).toHaveBeenCalledOnce();
    expect(replace).toHaveBeenCalledWith("/login");
  });

  it("distingue las solicitudes pendientes y rechazadas", () => {
    perfilActual = perfil({ profile: { ...profile, activo: false, estado_aprobacion: "pendiente" } });
    const { unmount } = render(<SessionGate>contenido</SessionGate>);
    expect(screen.getByText("Tu solicitud está pendiente de aprobación.")).toBeInTheDocument();
    expect(screen.queryByText("contenido")).not.toBeInTheDocument();
    unmount();
    perfilActual = perfil({ profile: { ...profile, activo: false, estado_aprobacion: "rechazado" } });
    render(<SessionGate>contenido</SessionGate>);
    expect(screen.getByText("Tu solicitud fue rechazada.")).toBeInTheDocument();
  });
});

describe("AccountMenu", () => {
  it("calcula iniciales", () => {
    expect(initials("Ana María Pérez")).toBe("AP");
    expect(initials("ana")).toBe("AN");
    expect(initials(null, "luis@example.org")).toBe("L");
    expect(initials(null, null)).toBe("");
  });

  it("muestra nombre, club, rol y el enlace a Miembros para admin", async () => {
    render(<AccountMenu />);
    const trigger = screen.getByRole("button", { name: "Cuenta: Ana María Pérez" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Rotary Club Panamá (Rotary)")).toBeInTheDocument();
    expect(screen.getByText("Administrador")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Miembros" })).toHaveAttribute("href", "/miembros");
    await userEvent.keyboard("{Escape}");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });

  it("oculta Miembros a un miembro y cierra sesión", async () => {
    const signOut = vi.fn(async () => {});
    perfilActual = perfil({ isAdmin: false, profile: { ...profile, rol: "miembro" }, signOut });
    render(<AccountMenu />);
    await userEvent.click(screen.getByRole("button", { name: /Cuenta/ }));
    expect(screen.queryByRole("link", { name: "Miembros" })).not.toBeInTheDocument();
    expect(screen.getByText("Miembro")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cerrar sesión" }));
    expect(signOut).toHaveBeenCalledOnce();
    expect(replace).toHaveBeenCalledWith("/login");
  });

  it("nunca usa transition-all", async () => {
    render(<AccountMenu />);
    await userEvent.click(screen.getByRole("button", { name: /Cuenta/ }));
    expect(document.body.innerHTML).not.toContain("transition-all");
  });

  it("muestra nombre y apellido (y el nombre completo de un perfil antiguo)", async () => {
    perfilActual = perfil({ profile: { ...profile, nombre: "Luis", apellido: "Alain", nombre_completo: "Viejo" } });
    const { unmount } = render(<AccountMenu />);
    expect(screen.getByRole("button", { name: "Cuenta: Luis Alain" })).toHaveTextContent("LA");
    unmount();
    perfilActual = perfil({ profile: { ...profile, nombre: null, apellido: null, nombre_completo: "Carla Gómez" } });
    render(<AccountMenu />);
    expect(screen.getByRole("button", { name: "Cuenta: Carla Gómez" })).toBeInTheDocument();
  });

  it("edita mis datos, refresca el perfil y devuelve el foco al botón de cuenta", async () => {
    const refreshPerfil = vi.fn(async () => {});
    perfilActual = perfil({ refresh: refreshPerfil });
    render(<AccountMenu />);
    const trigger = screen.getByRole("button", { name: /Cuenta/ });
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("button", { name: "Editar mis datos" }));

    const dialogo = await screen.findByRole("dialog", { name: "Editar mis datos" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    const nombre = within(dialogo).getByLabelText("Nombre");
    const apellido = within(dialogo).getByLabelText("Apellido");
    expect(nombre).toHaveValue("Ana María");
    expect(apellido).toHaveValue("Pérez");

    await userEvent.clear(nombre);
    await userEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    expect(nombre).toHaveFocus();
    expect(nombre).toHaveAccessibleDescription("Escribe tu nombre.");
    expect(perfilUpdates).toHaveLength(0);

    await userEvent.type(nombre, " Ana ");
    await userEvent.clear(apellido);
    await userEvent.type(apellido, "Pérez Díaz");
    await userEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    expect(perfilUpdates).toEqual([{ id: "u1", cambio: { nombre: "Ana", apellido: "Pérez Díaz" } }]);
    expect(refreshPerfil).toHaveBeenCalledOnce();
    expect(toastSuccess).toHaveBeenCalledWith("Tus datos se guardaron.");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("si no se puede guardar, el diálogo muestra el error y sigue abierto", async () => {
    respuestaUpdate = { data: null, error: null }; // RLS: 0 filas
    render(<AccountMenu />);
    await userEvent.click(screen.getByRole("button", { name: /Cuenta/ }));
    await userEvent.click(screen.getByRole("button", { name: "Editar mis datos" }));
    const dialogo = await screen.findByRole("dialog");
    await userEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    expect(await within(dialogo).findByText("No se pudieron guardar tus datos. Inténtalo de nuevo.")).toBeInTheDocument();
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("sin red no intenta guardar mis datos", async () => {
    const spy = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    render(<AccountMenu />);
    await userEvent.click(screen.getByRole("button", { name: /Cuenta/ }));
    await userEvent.click(screen.getByRole("button", { name: "Editar mis datos" }));
    const dialogo = await screen.findByRole("dialog");
    await userEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    expect(
      await within(dialogo).findByText("Sin conexión. Necesitas internet para cambiar tus datos."),
    ).toBeInTheDocument();
    expect(perfilUpdates).toHaveLength(0);
    spy.mockRestore();
  });
});
