import { defineConfig, devices } from "@playwright/test";

/**
 * Tests end-to-end. Requieren los navegadores de Playwright:
 *   npx playwright install chromium
 * y un proyecto de Supabase de pruebas (nunca datos reales) configurado en `.env.local`.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3000",
    locale: "es-PA",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "movil",
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer: {
    command: "npm run build && npm run start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
