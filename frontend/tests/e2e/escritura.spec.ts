import { expect, test } from "@playwright/test";

/**
 * Escritura real desde la interfaz: crear un espacio y una reserva.
 *
 * Verifica el camino completo — formulario en el navegador, validación en el
 * servidor y persistencia en Postgres — no solo la lectura de datos.
 */
test.describe("Escritura desde la interfaz", () => {
  test("la dirección crea un espacio y aparece en la tabla", async ({ page }) => {
    const nombre = `Sala de e2e ${Date.now()}`;

    await page.goto("/entrar");
    await page.getByLabel("Correo").fill("admin@kairo.local");
    await page.getByLabel("Contraseña").fill("kairo123");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByRole("heading", { name: "Tablero" })).toBeVisible();

    await page.getByRole("link", { name: "Espacios" }).click();
    await page.getByRole("button", { name: "Nuevo espacio" }).click();

    const dialogo = page.getByRole("dialog");
    await expect(dialogo).toBeVisible();

    await dialogo.getByLabel("Nombre").fill(nombre);
    await dialogo.getByLabel("Zona").fill("Planta de pruebas");
    await dialogo.getByLabel("Capacidad").fill("7");
    await dialogo.getByLabel("Tarifa por hora").fill("15000");

    await dialogo.getByRole("button", { name: "Guardar" }).click();

    // El diálogo se cierra y el espacio aparece en la tabla.
    await expect(dialogo).toBeHidden();
    await expect(page.getByText(nombre)).toBeVisible();
  });

  test("el cliente crea una reserva para un espacio", async ({ page }) => {
    // Fecha única por ejecución: la reserva debe poder repetirse sin chocar
    // con las de corridas anteriores.
    const marca = Date.now() % 100000;
    const dia = `20${30 + Math.floor(marca / 10000)}-${String((marca % 10000) % 12 + 1).padStart(2, "0")}-${String(marca % 28 + 1).padStart(2, "0")}`;

    await page.goto("/entrar");
    await page.getByLabel("Correo").fill("valentina@kairo.local");
    await page.getByLabel("Contraseña").fill("kairo123");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByRole("heading", { name: "Tablero" })).toBeVisible();

    await page.getByRole("link", { name: "Reservar" }).click();
    await page.getByRole("button", { name: "Nueva reserva" }).click();

    const dialogo = page.getByRole("dialog");
    await expect(dialogo).toBeVisible();

    // Elige un espacio concreto por nombre: el primero de la lista puede
    // ser uno creado por otra prueba y tener ya una reserva.
    await dialogo.getByLabel("Espacio").click();
    await page.getByRole("option", { name: /Terraza/ }).click();

    await dialogo.getByLabel("Inicio").fill(`${dia}T08:00`);
    await dialogo.getByLabel("Fin").fill(`${dia}T10:00`);

    await dialogo.getByRole("button", { name: "Guardar" }).click();

    // El diálogo se cierra sin errores visibles.
    await expect(dialogo).toBeHidden();
  });

  test("el backend rechaza un horario inválido y la interfaz lo muestra", async ({ page }) => {
    await page.goto("/entrar");
    await page.getByLabel("Correo").fill("valentina@kairo.local");
    await page.getByLabel("Contraseña").fill("kairo123");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByRole("heading", { name: "Tablero" })).toBeVisible();

    await page.getByRole("link", { name: "Reservar" }).click();
    await page.getByRole("button", { name: "Nueva reserva" }).click();

    const dialogo = page.getByRole("dialog");
    await dialogo.getByLabel("Espacio").click();
    await page.getByRole("option").first().click();

    // 05:00 está antes de la apertura: el servidor responde 422.
    await dialogo.getByLabel("Inicio").fill("2026-12-02T05:00");
    await dialogo.getByLabel("Fin").fill("2026-12-02T07:00");
    await dialogo.getByRole("button", { name: "Guardar" }).click();

    await expect(dialogo.getByRole("alert")).toContainText(/7:00 a 23:00/i);
  });
});
