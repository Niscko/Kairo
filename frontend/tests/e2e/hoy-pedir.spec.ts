import { expect, test } from "@playwright/test";

/**
 * La agenda del día y el pedido al mostrador: dos pantallas que el legacy
 * tenía y que se reconstruyeron sobre la API nueva.
 */
test.describe("Hoy y Pedir", () => {
  test("la agenda muestra el día en curso", async ({ page }) => {
    await page.goto("/entrar");
    await page.getByLabel("Correo").fill("admin@kairo.local");
    await page.getByLabel("Contraseña").fill("kairo123");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByRole("heading", { name: "Tablero" })).toBeVisible();

    await page.getByRole("link", { name: "Hoy" }).click();
    await expect(page.getByRole("heading", { name: "Hoy" })).toBeVisible();

    // El encabezado de la sección de reservas.
    await expect(
      page.getByRole("heading", { name: "Reservas", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Espacios", exact: true })).toBeVisible();
    // Los turnos del personal vienen del backend.
    await expect(page.getByText("Turnos del personal")).toBeVisible();
  });

  test("el catálogo permite armar un pedido", async ({ page }) => {
    await page.goto("/entrar");
    await page.getByLabel("Correo").fill("valentina@kairo.local");
    await page.getByLabel("Contraseña").fill("kairo123");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByRole("heading", { name: "Tablero" })).toBeVisible();

    await page.getByRole("link", { name: "Pedir" }).click();
    await expect(page.getByRole("heading", { name: "Pedir" })).toBeVisible();

    // Los productos del menú están en pantalla.
    await expect(page.getByText("Americano")).toBeVisible();
    await expect(page.getByText("Latte")).toBeVisible();

    // Agrega un producto y comprueba que el carrito lo cuenta.
    await page.getByRole("button", { name: "Agregar" }).first().click();
    await expect(page.getByRole("button", { name: /Ver pedido/ })).toContainText("1");

    // Abre el diálogo y confirma.
    await page.getByRole("button", { name: "Ver pedido" }).click();
    const dialogo = page.getByRole("dialog");
    await expect(dialogo).toBeVisible();
    await expect(dialogo.getByText("Total")).toBeVisible();
  });

  test("el cliente ve su propia agenda, no la del local", async ({ page }) => {
    await page.goto("/entrar");
    await page.getByLabel("Correo").fill("valentina@kairo.local");
    await page.getByLabel("Contraseña").fill("kairo123");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByRole("heading", { name: "Tablero" })).toBeVisible();

    await page.getByRole("link", { name: "Hoy" }).click();
    await expect(page.getByRole("heading", { name: "Hoy" })).toBeVisible();

    // El personal no ve los turnos de otros clientes.
    await expect(page.getByText("Turnos del personal")).toHaveCount(0);
  });
});

test.describe("Exportaciones", () => {
  test("la dirección descarga el reporte en CSV", async ({ page }) => {
    await page.goto("/entrar");
    await page.getByLabel("Correo").fill("admin@kairo.local");
    await page.getByLabel("Contraseña").fill("kairo123");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByRole("heading", { name: "Tablero" })).toBeVisible();

    await page.getByRole("link", { name: "Reportes" }).click();
    await expect(page.getByRole("heading", { name: "Reportes" })).toBeVisible();

    await page.getByRole("button", { name: "Descargar" }).click();
    await expect(page.getByRole("menuitem", { name: /Ventas/ })).toBeVisible();

    // La descarga responde con un CSV válido. Se consulta desde la página
    // para que viaje la cookie de sesión: el access token vive en
    // sessionStorage y no lo envía una petición suelta.
    const respuesta = await page.evaluate(async () => {
      const token = sessionStorage.getItem("kairo.access");
      const respuesta = await fetch("/api/exportaciones/ventas.csv?rango=21d", {
        headers: { Authorization: `Bearer ${token}` },
      });
      return { status: respuesta.status, tipo: respuesta.headers.get("content-type"), cuerpo: await respuesta.text() };
    });

    expect(respuesta.status).toBe(200);
    expect(respuesta.tipo).toContain("text/csv");
    expect(respuesta.cuerpo).toContain("Fecha;");
  });
});
