import { expect, test } from "@playwright/test";

/**
 * Capturas de la aplicación para revisión visual.
 * Es una herramienta de apoyo, no una verificación: no falla si el directorio
 * de salida no existe.
 */
test("capturas de la aplicación", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.goto("/entrar");
  await expect(page.getByLabel("Correo")).toBeVisible();
  await page.screenshot({ path: "screenshots/01-login.png", fullPage: true });

  await page.getByLabel("Correo").fill("admin@kairo.local");
  await page.getByLabel("Contraseña").fill("kairo123");
  await page.getByRole("button", { name: "Entrar" }).click();

  await expect(page.getByRole("heading", { name: "Tablero" })).toBeVisible();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "screenshots/02-dashboard.png", fullPage: true });

  await page.getByRole("link", { name: "Espacios" }).click();
  await expect(page.getByRole("heading", { name: "Espacios" })).toBeVisible();
  await page.waitForTimeout(600);
  await page.screenshot({ path: "screenshots/03-espacios.png", fullPage: true });

  await page.getByRole("link", { name: "Reservar" }).click();
  await expect(page.getByRole("heading", { name: "Reservar" })).toBeVisible();
  await page.waitForTimeout(600);
  await page.screenshot({ path: "screenshots/04-reservas.png", fullPage: true });

  await page.getByRole("link", { name: "Inventario" }).click();
  await expect(page.getByRole("heading", { name: "Inventario" })).toBeVisible();
  await page.waitForTimeout(600);
  await page.screenshot({ path: "screenshots/05-inventario.png", fullPage: true });

  await page.getByRole("link", { name: "Operación" }).click();
  await expect(page.getByRole("heading", { name: "Operación" })).toBeVisible();
  await page.waitForTimeout(600);
  await page.screenshot({ path: "screenshots/06-operacion.png", fullPage: true });
});
