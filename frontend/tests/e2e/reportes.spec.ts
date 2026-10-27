import { expect, test } from "@playwright/test";

/**
 * La pantalla de reportes es el resumen financiero de la operación: los
 * números deben llegar del backend y ser coherentes entre sí.
 */
test.describe("Reportes", () => {
  test("la dirección ve el reporte con sus cifras", async ({ page }) => {
    await page.goto("/entrar");
    await page.getByLabel("Correo").fill("admin@kairo.local");
    await page.getByLabel("Contraseña").fill("kairo123");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByRole("heading", { name: "Tablero" })).toBeVisible();

    await page.getByRole("link", { name: "Reportes" }).click();
    await expect(page.getByRole("heading", { name: "Reportes" })).toBeVisible();

    // Los cuatro indicadores principales.
    await expect(page.getByText("Ingresos", { exact: true })).toBeVisible();
    await expect(page.getByText("Egresos", { exact: true })).toBeVisible();
    await expect(page.getByText("Margen", { exact: true })).toBeVisible();
    await expect(page.getByText("Ocupación", { exact: true })).toBeVisible();

    // Las secciones de análisis.
    await expect(page.getByText("Ingresos y egresos por día")).toBeVisible();
    await expect(page.getByText("Demanda por hora")).toBeVisible();
    await expect(page.getByText("Utilización de espacios")).toBeVisible();
    await expect(page.getByText("Productos con más ingresos")).toBeVisible();
    await expect(page.getByText("Detalle de los costos")).toBeVisible();
  });

  test("el período se puede cambiar", async ({ page }) => {
    await page.goto("/entrar");
    await page.getByLabel("Correo").fill("admin@kairo.local");
    await page.getByLabel("Contraseña").fill("kairo123");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByRole("heading", { name: "Tablero" })).toBeVisible();

    await page.getByRole("link", { name: "Reportes" }).click();
    await expect(page.getByRole("heading", { name: "Reportes" })).toBeVisible();
    await expect(page.getByText(/Período: Últimos 21 días/)).toBeVisible();

    await page.getByLabel("Período").click();
    await page.getByRole("option", { name: "Últimos 7 días" }).click();

    await expect(page.getByText(/Período: Últimos 7 días/)).toBeVisible();
  });

  test("el personal no ve el módulo de reportes", async ({ page }) => {
    await page.goto("/entrar");
    await page.getByLabel("Correo").fill("barista@kairo.local");
    await page.getByLabel("Contraseña").fill("kairo123");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByRole("heading", { name: "Tablero" })).toBeVisible();

    // El enlace no aparece en la navegación.
    await expect(page.getByRole("link", { name: "Reportes" })).toHaveCount(0);

    // Y la ruta directa redirige al panel.
    await page.goto("/reportes");
    await expect(page).toHaveURL(/\/$/);
  });
});
