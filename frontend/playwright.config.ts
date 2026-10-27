import { defineConfig, devices } from "@playwright/test";

/**
 * Pruebas de extremo a extremo contra el stack en Docker.
 *
 * Requisito: `make up` debe estar corriendo. La aplicación se abre por el
 * puerto del frontend (nginx), que hace proxy de /api al backend: así se
 * ejercita la configuración real de producción, incluido el mismo origen.
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:8080";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: { timeout: 7_000 },
  // Un solo worker: los tests comparten la misma base de datos.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    locale: "es-CO",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});