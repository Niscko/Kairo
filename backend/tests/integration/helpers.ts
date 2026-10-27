import request from "supertest";
import type { Express } from "express";

/**
 * Utilidades compartidas por las pruebas de integración.
 *
 * El backend exige el token CSRF de la doble cookie en cada escritura. Las
 * pruebas se autentican como lo haría el navegador: capturan la cookie
 * `kairo.csrf` que devuelve el login y la copian a la cabecera
 * `X-XSRF-TOKEN`.
 */

export const PASSWORD = "kairo123";

export interface Sesion {
  token: string;
  csrf: string;
  /** Cabeceras listas para supertest, con el token de acceso y el de CSRF. */
  headers: Record<string, string>;
  /** Cookie `kairo.csrf` completa, para mandarla como cabecera `Cookie`. */
  cookie: string;
}

/** Inicia sesión y devuelve el token de acceso junto con el de CSRF. */
export async function iniciarSesion(
  app: Express,
  email: string,
  password: string = PASSWORD,
): Promise<Sesion> {
  const response = await request(app).post("/api/auth/login").send({ email, password }).expect(200);

  const token = response.body.accessToken as string;
  const cookies = response.headers["set-cookie"] as unknown as string[] | undefined;
  const csrfCookie = cookies
    ?.map((cookie) => cookie.split(";")[0] ?? "")
    .find((cookie) => cookie.startsWith("kairo.csrf="));

  if (!csrfCookie) {
    throw new Error(`El login de ${email} no devolvió la cookie kairo.csrf`);
  }
  const csrf = csrfCookie.slice("kairo.csrf=".length);

  return {
    token,
    csrf,
    cookie: `kairo.csrf=${csrf}`,
    headers: {
      Authorization: `Bearer ${token}`,
      "X-XSRF-TOKEN": csrf,
      // La cookie también viaja: el backend exige que la cabecera y la cookie
      // coincidan, igual que en el navegador.
      Cookie: `kairo.csrf=${csrf}`,
    },
  };
}

/** Cabeceras de solo lectura: basta el token de acceso. */
export function soloLectura(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}
