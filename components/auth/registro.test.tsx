import { AuthApiError, AuthWeakPasswordError } from "@supabase/supabase-js";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClubPublico } from "@/lib/types";

const replace = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh, push: vi.fn() }),
  usePathname: () => "/registro",
}));

const CLUBES: ClubPublico[] = [
  { id: "11111111-1111-4111-8111-111111111111", nombre: "Rotary Club Panamá", tipo: "rotary" },
  { id: "22222222-2222-4222-8222-222222222222", nombre: "Rotaract Club Panamá", tipo: "rotaract" },
  { id: "33333333-3333-4333-8333-333333333333", nombre: "Rotary Club David", tipo: "rotary" },
];

const signUp = vi.fn();
const getSession = vi.fn(async () => ({ data: { session: null as unknown }, error: null }));
const rpc = vi.fn<(fn: string) => Promise<{ data: unknown; error: unknown }>>(async () => ({
  data: CLUBES,
  error: null,
}));
vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => ({ auth: { signUp, getSession }, rpc }),
}));
vi.mock("@/lib/env", () => ({ hasSupabaseEnv: () => true }));

const { RegistroForm } = await import("@/components/auth/RegistroForm");

const user = { id: "u9", identities: [{ id: "i1" }] };

async function llenar(over: Partial<Record<string, string>> = {}) {
  const v = {
    Nombre: "Ana",
    Apellido: "Pérez",
    "Correo electrónico": "ana@example.org",
    Contraseña: "una-clave-segura",
    "Repetir contraseña": "una-clave-segura",
    ...over,
  };
  await screen.findByRole("option", { name: "Rotary Club David" });
  for (const [label, valor] of Object.entries(v)) {
    if (valor) await userEvent.type(screen.getByLabelText(label), valor);
  }
  await userEvent.selectOptions(screen.getByLabelText("Club"), CLUBES[2].id);
}

beforeEach(() => {
  replace.mockReset();
  refresh.mockReset();
  signUp.mockReset();
  rpc.mockReset();
  rpc.mockImplementation(async () => ({ data: CLUBES, error: null }));
  getSession.mockImplementation(async () => ({ data: { session: null }, error: null }));
});

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("RegistroForm", () => {
  it("tiene los campos etiquetados con el autocompletado correcto y los clubes agrupados", async () => {
    render(<RegistroForm />);
    expect(screen.getByLabelText("Nombre")).toHaveAttribute("autocomplete", "given-name");
    expect(screen.getByLabelText("Apellido")).toHaveAttribute("autocomplete", "family-name");
    const correo = screen.getByLabelText("Correo electrónico");
    expect(correo).toHaveAttribute("type", "email");
    expect(correo).toHaveAttribute("autocomplete", "email");
    const pass = screen.getByLabelText("Contraseña");
    expect(pass).toHaveAttribute("autocomplete", "new-password");
    expect(pass).toHaveAccessibleDescription("Mínimo 8 caracteres.");
    expect(screen.getByLabelText("Repetir contraseña")).toHaveAttribute("autocomplete", "new-password");

    await screen.findByRole("option", { name: "Rotary Club David" });
    expect(rpc).toHaveBeenCalledWith("clubs_publicos");
    const grupos = screen.getAllByRole("group");
    expect(grupos.map((g) => g.getAttribute("label"))).toEqual(["Rotary", "Rotaract"]);
    expect(within(grupos[0]).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Rotary Club David",
      "Rotary Club Panamá",
    ]);
    expect(screen.getByRole("link", { name: "Entrar" })).toHaveAttribute("href", "/login");
  });

  it("valida en español junto a cada campo y enfoca el primer error", async () => {
    render(<RegistroForm />);
    await screen.findByRole("option", { name: "Rotary Club David" });
    await userEvent.type(screen.getByLabelText("Nombre"), "Ana");
    await userEvent.type(screen.getByLabelText("Contraseña"), "corta");
    await userEvent.type(screen.getByLabelText("Repetir contraseña"), "distinta");
    await userEvent.click(screen.getByRole("button", { name: "Crear cuenta" }));

    const apellido = screen.getByLabelText("Apellido");
    expect(apellido).toHaveFocus();
    expect(apellido).toHaveAttribute("aria-invalid", "true");
    expect(apellido).toHaveAccessibleDescription("Escribe tu apellido.");
    expect(screen.getByLabelText("Nombre")).not.toHaveAttribute("aria-invalid");
    expect(screen.getByLabelText("Club")).toHaveAccessibleDescription("Elige tu club.");
    expect(screen.getByLabelText("Correo electrónico")).toHaveAccessibleDescription("Escribe tu correo.");
    expect(screen.getByLabelText("Contraseña")).toHaveAccessibleDescription(
      "La contraseña debe tener al menos 8 caracteres.",
    );
    expect(screen.getByLabelText("Repetir contraseña")).toHaveAccessibleDescription("Las contraseñas no coinciden.");
    expect(signUp).not.toHaveBeenCalled();

    // Al corregir, el error desaparece.
    await userEvent.type(apellido, "Pérez");
    expect(apellido).not.toHaveAttribute("aria-invalid");
  });

  it("crea la cuenta con los metadatos y entra si Supabase devuelve sesión", async () => {
    window.history.replaceState(null, "", "/registro?next=%2Fregistros");
    signUp.mockResolvedValue({ data: { user, session: { access_token: "t" } }, error: null });
    render(<RegistroForm />);
    await llenar({ Nombre: "  Ana ", "Correo electrónico": " ana@example.org " });
    await userEvent.click(screen.getByRole("button", { name: "Crear cuenta" }));

    expect(signUp).toHaveBeenCalledWith({
      email: "ana@example.org",
      password: "una-clave-segura",
      options: {
        data: { nombre: "Ana", apellido: "Pérez", club_id: CLUBES[2].id },
        emailRedirectTo: `${window.location.origin}/login`,
      },
    });
    expect(replace).toHaveBeenCalledWith("/registros");
  });

  it("sin sesión (confirmación de correo) avisa de la revisión administrativa", async () => {
    signUp.mockResolvedValue({ data: { user, session: null }, error: null });
    render(<RegistroForm />);
    await llenar();
    await userEvent.click(screen.getByRole("button", { name: "Crear cuenta" }));

    const titulo = await screen.findByRole("heading", { name: "Revisa tu correo" });
    expect(titulo).toHaveFocus();
    expect(
      screen.getByText("Te enviamos un correo para confirmar tu cuenta. Después de confirmarla, un administrador revisará tu solicitud antes de darte acceso."),
    ).toBeInTheDocument();
    expect(screen.getByText("ana@example.org")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ir a iniciar sesión" })).toHaveAttribute("href", "/login");
    expect(replace).not.toHaveBeenCalled();
  });

  it("un correo ya registrado (usuario sin identidades) marca el correo", async () => {
    signUp.mockResolvedValue({ data: { user: { id: "x", identities: [] }, session: null }, error: null });
    render(<RegistroForm />);
    await llenar();
    await userEvent.click(screen.getByRole("button", { name: "Crear cuenta" }));
    const correo = screen.getByLabelText("Correo electrónico");
    await waitFor(() => expect(correo).toHaveFocus());
    expect(correo).toHaveAccessibleDescription("Ya existe una cuenta con ese correo. Inicia sesión.");
    expect(screen.queryByRole("heading", { name: "Revisa tu correo" })).not.toBeInTheDocument();
  });

  it("traduce user_already_exists y lo quita al cambiar el correo", async () => {
    signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: new AuthApiError("User already registered", 422, "user_already_exists"),
    });
    render(<RegistroForm />);
    await llenar();
    await userEvent.click(screen.getByRole("button", { name: "Crear cuenta" }));
    const correo = screen.getByLabelText("Correo electrónico");
    expect(await screen.findByText("Ya existe una cuenta con ese correo. Inicia sesión.")).toBeInTheDocument();
    expect(correo).toHaveAttribute("aria-invalid", "true");
    await userEvent.type(correo, "x");
    expect(screen.queryByText("Ya existe una cuenta con ese correo. Inicia sesión.")).not.toBeInTheDocument();
  });

  it("marca la contraseña débil", async () => {
    signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: new AuthWeakPasswordError("weak", 422, ["characters"]),
    });
    render(<RegistroForm />);
    await llenar();
    await userEvent.click(screen.getByRole("button", { name: "Crear cuenta" }));
    const pass = screen.getByLabelText("Contraseña");
    await waitFor(() => expect(pass).toHaveFocus());
    expect(pass).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(/La contraseña es muy fácil de adivinar/)).toBeInTheDocument();
  });

  it("avisa si el registro está desactivado en Supabase", async () => {
    signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: new AuthApiError("Signups not allowed for this instance", 422, "signup_disabled"),
    });
    render(<RegistroForm />);
    await llenar();
    await userEvent.click(screen.getByRole("button", { name: "Crear cuenta" }));
    expect(
      await screen.findByText("El registro está desactivado. Pide a un administrador que lo active."),
    ).toBeInTheDocument();
  });

  it("muestra y oculta ambas contraseñas", async () => {
    render(<RegistroForm />);
    const boton = screen.getByRole("button", { name: "Mostrar contraseñas" });
    expect(screen.getByLabelText("Contraseña")).toHaveAttribute("type", "password");
    await userEvent.click(boton);
    expect(boton).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Contraseña")).toHaveAttribute("type", "text");
    expect(screen.getByLabelText("Repetir contraseña")).toHaveAttribute("type", "text");
  });

  it("si no carga la lista de clubes pide conexión y permite reintentar", async () => {
    rpc.mockImplementationOnce(async () => {
      throw new TypeError("Failed to fetch");
    });
    render(<RegistroForm />);
    expect(await screen.findByText("Necesitas conexión para crear una cuenta.")).toBeInTheDocument();
    const reintentar = screen.getByRole("button", { name: "Reintentar" });

    // Enviar sin clubes enfoca "Reintentar" y no llama a Supabase.
    await userEvent.type(screen.getByLabelText("Nombre"), "Ana");
    await userEvent.type(screen.getByLabelText("Apellido"), "Pérez");
    await userEvent.type(screen.getByLabelText("Correo electrónico"), "ana@example.org");
    await userEvent.type(screen.getByLabelText("Contraseña"), "una-clave-segura");
    await userEvent.type(screen.getByLabelText("Repetir contraseña"), "una-clave-segura");
    await userEvent.click(screen.getByRole("button", { name: "Crear cuenta" }));
    expect(reintentar).toHaveFocus();
    expect(screen.getByText("Necesitas conexión para cargar la lista de clubes.")).toBeInTheDocument();
    expect(signUp).not.toHaveBeenCalled();

    await userEvent.click(reintentar);
    expect(await screen.findByRole("option", { name: "Rotary Club David" })).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("sin red no intenta crear la cuenta", async () => {
    render(<RegistroForm />);
    await llenar();
    const spy = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    await userEvent.click(screen.getByRole("button", { name: "Crear cuenta" }));
    expect(await screen.findByText("Necesitas conexión para crear una cuenta.")).toBeInTheDocument();
    expect(signUp).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("con sesión ya abierta en el dispositivo entra directo", async () => {
    getSession.mockImplementation(async () => ({ data: { session: { access_token: "t" } }, error: null }));
    render(<RegistroForm />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });

  it("conserva el next interno en el enlace a /login", async () => {
    window.history.replaceState(null, "", "/registro?next=%2Fmiembros");
    render(<RegistroForm />);
    expect(screen.getByRole("link", { name: "Entrar" })).toHaveAttribute("href", "/login?next=%2Fmiembros");
  });

  it("nunca usa transition-all", () => {
    render(<RegistroForm />);
    expect(document.body.innerHTML).not.toContain("transition-all");
  });
});
