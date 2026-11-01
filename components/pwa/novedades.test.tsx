import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import pkg from "@/package.json";
import { db } from "@/lib/db";
import { META_VERSION_VISTA, NOVEDADES, novedadesDe, versionCorta } from "@/lib/novedades";

const version = vi.hoisted(() => ({ actual: "1.1.0" }));
vi.mock("@/lib/version", () => ({
  get APP_VERSION() {
    return version.actual;
  },
}));
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

const { AvisoNovedades } = await import("@/components/pwa/AvisoNovedades");
const { AccountMenu } = await import("@/components/auth/AccountMenu");

beforeEach(async () => {
  version.actual = "1.1.0";
  await db.meta.clear();
});

describe("novedades", () => {
  it("la versión de package.json tiene sus novedades (no se olvidó la entrada)", () => {
    expect(NOVEDADES[0].version).toBe(pkg.version);
    expect(novedadesDe(pkg.version)?.cambios.length).toBeGreaterThan(0);
  });

  it("versión corta: 1.1.0 → 1.1; las correcciones se muestran completas", () => {
    expect(versionCorta("1.1.0")).toBe("1.1");
    expect(versionCorta("1.1.2")).toBe("1.1.2");
  });

  it("las notas no mencionan ajustes internos de datos", () => {
    const texto = NOVEDADES.flatMap((n) => n.cambios).join(" ").toLowerCase();
    expect(texto).not.toMatch(/duplicad|base de datos|club/);
  });
});

describe("AvisoNovedades", () => {
  it("tras actualizar (sin versión vista) muestra las novedades una vez", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<AvisoNovedades />);
    const dialogo = await screen.findByRole("dialog", { name: "Novedades de la versión 1.1" });
    expect(within(dialogo).getByText(/ahora dura 15 días/)).toBeInTheDocument();
    const entendido = within(dialogo).getByRole("button", { name: "Entendido" });
    expect(entendido).toHaveFocus();

    await user.click(entendido);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(async () => expect((await db.meta.get(META_VERSION_VISTA))?.value).toBe("1.1.0"));

    // Al volver a abrir la app ya no aparece.
    unmount();
    render(<AvisoNovedades />);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("si se vio una versión anterior, muestra las de la nueva", async () => {
    await db.meta.put({ key: META_VERSION_VISTA, value: "1.0.0" });
    render(<AvisoNovedades />);
    expect(await screen.findByRole("dialog", { name: "Novedades de la versión 1.1" })).toBeInTheDocument();
  });

  it("una versión sin novedades no abre nada", async () => {
    version.actual = "9.9.9";
    render(<AvisoNovedades />);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("Novedades en el menú de cuenta", () => {
  it("muestra la versión y abre las novedades en cualquier momento", async () => {
    const user = userEvent.setup();
    render(<AccountMenu />);
    await user.click(screen.getByRole("button", { name: /Cuenta/ }));
    expect(screen.getByText("Versión 1.1.0")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Novedades" }));
    expect(await screen.findByRole("dialog", { name: "Novedades de la versión 1.1" })).toBeInTheDocument();
  });
});
