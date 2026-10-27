import { expect, test } from "@playwright/test";

/**
 * Recorrido de la aplicación: acceso, navegación por rol y lectura de datos
 * reales desde la base de datos.
 */
test.describe("Kairo", () => {
  test("la web exige iniciar sesión", async ({ page }) => {
    await page.goto("/");

    // Sin sesión, el router redirige al formulario de acceso.
    await expect(page).toHaveURL(/\/entrar/);
    await expect(page.getByRole("heading", { name: /un solo sistema/i })).toBeVisible();
    await expect(page.getByLabel("Correo")).toBeVisible();
  });

  test("un usuario válido entra y ve el panel", async ({ page }) => {
    await page.goto("/entrar");

    await page.getByLabel("Correo").fill("admin@kairo.local");
    await page.getByLabel("Contraseña").fill("kairo123");
    await page.getByRole("button", { name: "Entrar" }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "Tablero" })).toBeVisible();
    // Los indicadores llegan del backend, con datos sembrados.
    await expect(page.getByText("Ventas de hoy")).toBeVisible();
    await expect(page.getByText("Espacios ocupados")).toBeVisible();
  });

  test("las credenciales incorrectas muestran un error legible", async ({ page }) => {
    await page.goto("/entrar");

    await page.getByLabel("Correo").fill("admin@kairo.local");
    await page.getByLabel("Contraseña").fill("contraseña-equivocada");
    await page.getByRole("button", { name: "Entrar" }).click();

    await expect(page.getByRole("alert")).toContainText(/correo o contraseña incorrectos/i);
  });

  test("una cuenta inactiva no puede entrar", async ({ page }) => {
    await page.goto("/entrar");

    await page.getByLabel("Correo").fill("inactivo@kairo.local");
    await page.getByLabel("Contraseña").fill("kairo123");
    await page.getByRole("button", { name: "Entrar" }).click();

    await expect(page.getByRole("alert")).toContainText(/inactiva/i);
  });

  test("la dirección navega a los módulos y ve los datos", async ({ page }) => {
    await page.goto("/entrar");
    await page.getByLabel("Correo").fill("admin@kairo.local");
    await page.getByLabel("Contraseña").fill("kairo123");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByRole("heading", { name: "Tablero" })).toBeVisible();

    // Espacios: la tabla muestra los espacios sembrados.
    await page.getByRole("link", { name: "Espacios" }).click();
    await expect(page.getByRole("heading", { name: "Espacios" })).toBeVisible();
    await expect(page.getByText("Puesto 01 · Ventana")).toBeVisible();
    await expect(page.getByText("Sala Ceiba")).toBeVisible();

    // Clientes: solo la dirección y el personal ven este módulo.
    await page.getByRole("link", { name: "Clientes" }).click();
    await expect(page.getByRole("heading", { name: "Clientes" })).toBeVisible();
    await expect(page.getByText("Valentina Henao")).toBeVisible();

    // Operación: solo la dirección.
    await page.getByRole("link", { name: "Operación" }).click();
    await expect(page.getByRole("heading", { name: "Operación" })).toBeVisible();
    await expect(page.getByText("Arriendo local Laureles")).toBeVisible();
  });

  test("un cliente no ve los módulos de gestión", async ({ page }) => {
    await page.goto("/entrar");
    await page.getByLabel("Correo").fill("valentina@kairo.local");
    await page.getByLabel("Contraseña").fill("kairo123");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByRole("heading", { name: "Tablero" })).toBeVisible();

    // La navegación del cliente no incluye gestión ni operación.
    await expect(page.getByRole("link", { name: "Clientes" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Operación" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Espacios" })).toBeVisible();
  });

  test("el idioma se puede cambiar", async ({ page }) => {
    await page.goto("/entrar");
    await page.getByLabel("Correo").fill("admin@kairo.local");
    await page.getByLabel("Contraseña").fill("kairo123");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByRole("heading", { name: "Tablero" })).toBeVisible();

    await page.getByRole("button", { name: "Idioma" }).click();
    await page.getByRole("menuitem", { name: "English" }).click();

    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  });

  test("cerrar sesión vuelve al formulario de acceso", async ({ page }) => {
    await page.goto("/entrar");
    await page.getByLabel("Correo").fill("admin@kairo.local");
    await page.getByLabel("Contraseña").fill("kairo123");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByRole("heading", { name: "Tablero" })).toBeVisible();

    await page.getByRole("button", { name: "Salir" }).click();
    await expect(page).toHaveURL(/\/entrar/);
  });
});
