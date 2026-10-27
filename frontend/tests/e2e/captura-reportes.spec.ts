import { expect, test } from "@playwright/test";

/**
 * Captura de la pantalla de reportes para revisión visual.
 * Es una herramienta de apoyo, no una verificación.
 */
test("captura de reportes", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });

  await page.goto("/entrar");
  await page.getByLabel("Correo").fill("admin@kairo.local");
  await page.getByLabel("Contraseña").fill("kairo123");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { name: "Tablero" })).toBeVisible();

  await page.getByRole("link", { name: "Reportes" }).click();
  await expect(page.getByRole("heading", { name: "Reportes" })).toBeVisible();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: "screenshots/07-reportes.png", fullPage: true });
});
