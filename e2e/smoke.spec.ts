import { expect, test } from "@playwright/test";

test("la página de inicio de sesión carga en español y en tema claro", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator("html")).toHaveAttribute("lang", "es-PA");
  await expect(page.locator('meta[name="color-scheme"]')).toHaveAttribute("content", "light");
});
