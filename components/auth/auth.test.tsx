import { AuthApiError } from "@supabase/supabase-js";
import { render, screen } from "@testing-library/react";
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
vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => ({ auth: { signInWithPassword, getSession } }),
}));

vi.mock("@/lib/env", () => ({ hasSupabaseEnv: () => true }));

let perfilActual: ProfileContextValue;
vi.mock("@/lib/auth/profile", () => ({ useProfile: () => perfilActual }));

const { LoginForm } = await import("@/components/auth/LoginForm");
const { AccountMenu, initials } = await import("@/components/auth/AccountMenu");
const { SessionGate, gateView } = await import("@/components/auth/SessionGate");

const profile: Profile = {
  id: "u1",
  nombre: "Ana María",
  apellido: "Pérez",
  nombre_completo: "Ana María Pérez",
  club_id: "c1",
  rol: "admin",
  activo: true,
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

describe("gateView", () => {
  const base = { profile, offline: false };
  it("decide según la sesión y el perfil", () => {
    expect(gateView({ ...base, status: "signed-out" })).toBe("redirect");
    expect(gateView({ ...base, status: "signed-in" })).toBe("app");
    expect(gateView({ ...base, status: "signed-in", profile: { ...profile, activo: false } })).toBe("inactive");
    expect(gateView({ ...base, status: "loading", profile: null })).toBe("loading");
    expect(gateView({ ...base, status: "loading" })).toBe("app");
    expect(gateView({ ...base, status: "signed-in", profile: null })).toBe("no-profile");
    // Sin red y sin perfil en caché: se deja pasar.
    expect(gateView({ status: "signed-in", profile: null, offline: true })).toBe("app");
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
});
