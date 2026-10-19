import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/",
}));
vi.mock("@/lib/auth/profile", () => ({
  useProfile: () => ({
    profile: null,
    club: null,
    isAdmin: false,
    email: "persona@example.org",
    offline: false,
    signOut: vi.fn(async () => {}),
  }),
}));

const { INSTRUCCION_IOS } = await import("@/components/pwa/InstallButton");
const { AccountMenu } = await import("@/components/auth/AccountMenu");

const UA_ORIGINAL = navigator.userAgent;
const UA_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

function ponerUA(ua: string) {
  Object.defineProperty(navigator, "userAgent", { configurable: true, get: () => ua });
}

function ponerStandalone(v: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (q: string) => ({
      matches: v && q.includes("standalone"),
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
}

async function abrirMenu() {
  render(<AccountMenu />);
  await userEvent.click(screen.getByRole("button", { name: /Cuenta/ }));
}

afterEach(() => {
  ponerUA(UA_ORIGINAL);
  ponerStandalone(false);
});

// El estado del módulo (evento capturado, instalada) se comparte: los casos van en orden.
describe("Instalar app en el menú de cuenta", () => {
  it("sin evento del navegador ni iPhone no muestra nada", async () => {
    ponerStandalone(false);
    await abrirMenu();
    expect(screen.queryByRole("button", { name: "Instalar app" })).not.toBeInTheDocument();
    expect(screen.queryByText(INSTRUCCION_IOS)).not.toBeInTheDocument();
  });

  it("en iPhone muestra la instrucción de Safari", async () => {
    ponerUA(UA_IPHONE);
    ponerStandalone(false);
    await abrirMenu();
    expect(screen.getByText(INSTRUCCION_IOS)).toBeInTheDocument();
  });

  it("en iPhone con la app ya instalada no muestra nada", async () => {
    ponerUA(UA_IPHONE);
    ponerStandalone(true);
    await abrirMenu();
    expect(screen.queryByText(INSTRUCCION_IOS)).not.toBeInTheDocument();
  });

  it("en Android/Chrome muestra el botón y lanza el aviso del navegador", async () => {
    ponerStandalone(false);
    const prompt = vi.fn(async () => {});
    const evento = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
      prompt,
      userChoice: Promise.resolve({ outcome: "accepted" as const }),
    });
    act(() => {
      window.dispatchEvent(evento);
    });
    expect(evento.defaultPrevented).toBe(true);
    await abrirMenu();
    await userEvent.click(screen.getByRole("button", { name: "Instalar app" }));
    expect(prompt).toHaveBeenCalledOnce();
    // Aceptada: ya no se ofrece.
    expect(screen.queryByRole("button", { name: "Instalar app" })).not.toBeInTheDocument();
  });

  it("una vez instalada no vuelve a ofrecerse", async () => {
    act(() => {
      window.dispatchEvent(new Event("appinstalled"));
    });
    ponerUA(UA_IPHONE);
    await abrirMenu();
    expect(screen.queryByRole("button", { name: "Instalar app" })).not.toBeInTheDocument();
    expect(screen.queryByText(INSTRUCCION_IOS)).not.toBeInTheDocument();
  });
});
