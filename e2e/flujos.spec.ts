/**
 * Flujos principales contra un Supabase LOCAL (`supabase start`) con datos ficticios.
 *
 * Se saltan solos si faltan las credenciales de prueba o si la app no apunta a
 * un Supabase local (nunca se ejecutan contra el proyecto real). Ver "Tests" en
 * el README para preparar los usuarios.
 *
 * Variables:
 * - NEXT_PUBLIC_SUPABASE_URL: URL del Supabase local (http://127.0.0.1:54321).
 * - E2E_MIEMBRO_EMAIL / E2E_MIEMBRO_PASSWORD: miembro activo con club.
 * - E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD: admin activo.
 * - E2E_INACTIVO_EMAIL / E2E_INACTIVO_PASSWORD: miembro con `activo = false` (opcional).
 */
import { expect, test, type Page } from "@playwright/test";

const env = process.env;

const MIEMBRO = { email: env.E2E_MIEMBRO_EMAIL, password: env.E2E_MIEMBRO_PASSWORD };
const ADMIN = { email: env.E2E_ADMIN_EMAIL, password: env.E2E_ADMIN_PASSWORD };
const INACTIVO = { email: env.E2E_INACTIVO_EMAIL, password: env.E2E_INACTIVO_PASSWORD };

/** Solo un Supabase en esta máquina (localhost / 127.0.0.1). */
function esSupabaseLocal(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const { hostname } = new URL(url);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  } catch {
    return false;
  }
}

const MOTIVO_LOCAL =
  "Los e2e de flujos solo corren contra un Supabase local: exporta NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 (ver README, Tests).";
const MOTIVO_CREDENCIALES =
  "Faltan E2E_MIEMBRO_EMAIL, E2E_MIEMBRO_PASSWORD, E2E_ADMIN_EMAIL o E2E_ADMIN_PASSWORD (ver README, Tests).";
const MOTIVO_INACTIVO = "Faltan E2E_INACTIVO_EMAIL o E2E_INACTIVO_PASSWORD (ver README, Tests).";

const hayCredenciales = Boolean(MIEMBRO.email && MIEMBRO.password && ADMIN.email && ADMIN.password);

/** Ubicación ficticia (Chitré, Herrera). */
const UBICACION = { latitude: 7.9616, longitude: -80.4245 };

test.beforeEach(async ({ context }) => {
  test.skip(!esSupabaseLocal(env.NEXT_PUBLIC_SUPABASE_URL), MOTIVO_LOCAL);
  // Sin peticiones a servicios externos (teselas, Nominatim): solo la app y el Supabase local.
  await context.route(/^https?:\/\/(?!localhost|127\.0\.0\.1|\[::1\])/, (route) => route.abort());
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation(UBICACION);
});

async function iniciarSesion(page: Page, cuenta: { email?: string; password?: string }) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(cuenta.email ?? "");
  await page.getByLabel("Contraseña", { exact: true }).fill(cuenta.password ?? "");
  await page.getByRole("button", { name: "Entrar" }).click();
}

async function esperarMapa(page: Page) {
  await page.waitForURL((url) => url.pathname === "/");
  await expect(page.getByRole("button", { name: /^Cuenta:/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Registrar familia" })).toBeVisible();
}

async function cerrarSesion(page: Page) {
  await page.getByRole("button", { name: /^Cuenta:/ }).click();
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await page.waitForURL((url) => url.pathname === "/login");
}

/** Registra una familia ficticia desde el mapa. Devuelve el id del reporte (de la URL). */
async function registrarFamilia(page: Page, nombre: string): Promise<string> {
  await page.getByRole("button", { name: "Mi ubicación" }).click();
  await page.getByRole("button", { name: "Registrar familia" }).click();
  const formulario = page.getByRole("form", { name: "Registrar familia" });
  await expect(formulario).toBeVisible();
  await formulario.getByLabel("Nombre del jefe o jefa de hogar").fill(nombre);
  await formulario.getByRole("button", { name: "Guardar reporte" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Guardar" }).click();
  // Tras guardar se abre la ficha: ?reporte=<id>.
  await page.waitForURL((url) => /^[0-9a-f-]{36}$/.test(url.searchParams.get("reporte") ?? ""));
  return new URL(page.url()).searchParams.get("reporte")!;
}

const nombreFicticio = (etiqueta: string) => `E2E ${etiqueta} ${Date.now().toString(36)}`;

test.describe("inicio de sesión", () => {
  test.beforeEach(() => {
    test.skip(!hayCredenciales, MOTIVO_CREDENCIALES);
  });

  test("miembro: entra al mapa y su menú muestra el rol Miembro, sin Miembros", async ({ page }) => {
    await iniciarSesion(page, MIEMBRO);
    await esperarMapa(page);
    await page.getByRole("button", { name: /^Cuenta:/ }).click();
    const menu = page.getByRole("region", { name: "Tu cuenta" });
    await expect(menu.getByText("Miembro", { exact: true })).toBeVisible();
    await expect(menu.getByRole("link", { name: "Miembros" })).toHaveCount(0);
  });

  test("admin: entra al mapa y su menú enlaza a Miembros", async ({ page }) => {
    await iniciarSesion(page, ADMIN);
    await esperarMapa(page);
    await page.getByRole("button", { name: /^Cuenta:/ }).click();
    const menu = page.getByRole("region", { name: "Tu cuenta" });
    await expect(menu.getByText("Administrador", { exact: true })).toBeVisible();
    await expect(menu.getByRole("link", { name: "Miembros" })).toBeVisible();
  });
});

test.describe("sin conexión", () => {
  test.beforeEach(() => {
    test.skip(!hayCredenciales, MOTIVO_CREDENCIALES);
  });

  test("un alta sin red queda pendiente y se sincroniza al volver la señal", async ({ page, context }) => {
    await iniciarSesion(page, MIEMBRO);
    await esperarMapa(page);

    await context.setOffline(true);
    const nombre = nombreFicticio("sin red");
    await registrarFamilia(page, nombre);
    await expect(page.getByText("Reporte guardado en este celular. Se enviará cuando haya conexión.")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Sincronizar ahora \(.*1 pendiente/ })).toBeVisible();

    await context.setOffline(false);
    // El evento `online` dispara la sincronización.
    await expect(page.getByRole("button", { name: /^Sincronizar ahora/ })).not.toHaveAccessibleName(/pendiente/, {
      timeout: 20_000,
    });

    await page.goto("/registros");
    await page.getByLabel(/^Buscar por nombre/).fill(nombre);
    const fila = page.getByRole("listitem").filter({ hasText: nombre });
    await expect(fila.getByText("Sincronizado")).toBeVisible();
  });
});

test.describe("sin borrado de reportes", () => {
  test.beforeEach(() => {
    test.skip(!hayCredenciales, MOTIVO_CREDENCIALES);
  });

  // Los reportes y las visitas no se borran, ni siquiera un admin. No hay limpieza
  // por borrado: los datos de prueba (nombres ficticios únicos) quedan en el
  // Supabase local.
  test("ni el miembro ni el admin ven una acción de borrar en la ficha", async ({ page }) => {
    const accionBorrar = (p: typeof page) => p.getByRole("button", { name: /borrar|eliminar|mantén pulsado/i });

    await iniciarSesion(page, MIEMBRO);
    await esperarMapa(page);
    const id = await registrarFamilia(page, nombreFicticio("sin-borrado"));
    await expect(page.getByRole("dialog", { name: "Ficha de la familia" })).toBeVisible();
    await expect(accionBorrar(page)).toHaveCount(0);
    await cerrarSesion(page);

    await iniciarSesion(page, ADMIN);
    await esperarMapa(page);
    await page.goto(`/?reporte=${id}`);
    await expect(page.getByRole("dialog", { name: "Ficha de la familia" })).toBeVisible();
    await expect(accionBorrar(page)).toHaveCount(0);
  });
});

test.describe("acceso desactivado", () => {
  test("un miembro desactivado ve el aviso y puede cerrar sesión", async ({ page }) => {
    test.skip(!(INACTIVO.email && INACTIVO.password), MOTIVO_INACTIVO);
    await iniciarSesion(page, INACTIVO);
    await expect(page.getByText("Tu acceso está desactivado.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Registrar familia" })).toHaveCount(0);
    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await page.waitForURL((url) => url.pathname === "/login");
  });
});
