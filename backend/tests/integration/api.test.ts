import { randomUUID } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../../src/app.js";

/**
 * Pruebas de integración contra una base real: no hay dobles de Prisma, así que
 * se ejercitan de verdad el enrutado, los guards y las consultas.
 *
 * Requisito: la base debe existir y estar sembrada (`pnpm seed`).
 */
const prisma = new PrismaClient();
const app = createApp();

const PASSWORD = "kairo123";

let adminToken = "";
let clienteToken = "";
const suffix = randomUUID().slice(0, 8);

beforeAll(async () => {
  await prisma.$connect();
  adminToken = await login("admin@kairo.local");
  clienteToken = await login("valentina@kairo.local");
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function login(email: string): Promise<string> {
  const response = await request(app)
    .post("/api/auth/login")
    .send({ email, password: PASSWORD })
    .expect(200);
  return response.body.accessToken as string;
}

describe("GET /api/health", () => {
  it("responde vivo sin tocar la base", async () => {
    const response = await request(app).get("/api/health/live").expect(200);
    expect(response.body.status).toBe("ok");
  });

  it("confirma conexión con la base de datos", async () => {
    const response = await request(app).get("/api/health/ready").expect(200);
    expect(response.body.database).toBe("ok");
  });
});

describe("POST /api/auth/login", () => {
  it("rechaza credenciales incorrectas", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@kairo.local", password: "incorrecta" })
      .expect(401);
    expect(response.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("rechaza una cuenta inactiva", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: "inactivo@kairo.local", password: PASSWORD })
      .expect(401);
    expect(response.body.error.message).toMatch(/inactiva/i);
  });

  it("valida el formato del correo", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: "no-es-un-correo", password: PASSWORD })
      .expect(422);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("establece la cookie de refresco como HttpOnly", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@kairo.local", password: PASSWORD })
      .expect(200);
    const cookies = response.headers["set-cookie"] as unknown as string[];
    const refresh = cookies.find((c) => c.startsWith("kairo.refresh="));
    expect(refresh).toBeDefined();
    expect(refresh).toMatch(/HttpOnly/i);
    expect(refresh).toMatch(/Path=\/api\/auth/i);
  });
});

describe("GET /api/auth/me", () => {
  it("devuelve el usuario del token", async () => {
    const response = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(response.body.user.email).toBe("admin@kairo.local");
  });

  it("exige un token", async () => {
    await request(app).get("/api/auth/me").expect(401);
  });

  it("rechaza un token con firma inválida", async () => {
    await request(app)
      .get("/api/auth/me")
      .set("Authorization", "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.manipulado")
      .expect(401);
  });
});

describe("GET /api/espacios", () => {
  it("exige autenticación", async () => {
    await request(app).get("/api/espacios").expect(401);
  });

  it("devuelve la página paginada", async () => {
    const response = await request(app)
      .get("/api/espacios?pageSize=5")
      .set("Authorization", `Bearer ${clienteToken}`)
      .expect(200);
    expect(response.body.datos.length).toBeLessThanOrEqual(5);
    expect(response.body.total).toBeGreaterThan(0);
    expect(response.body.totalPaginas).toBeGreaterThan(0);
  });

  it("filtra por tipo", async () => {
    const response = await request(app)
      .get("/api/espacios?tipo=sala")
      .set("Authorization", `Bearer ${clienteToken}`)
      .expect(200);
    for (const espacio of response.body.datos) {
      expect(espacio.tipo).toBe("sala");
    }
  });

  it("rechaza un tipo inválido", async () => {
    await request(app)
      .get("/api/espacios?tipo=inválido")
      .set("Authorization", `Bearer ${clienteToken}`)
      .expect(422);
  });

  it("devuelve 404 con un id inexistente", async () => {
    await request(app)
      .get("/api/espacios/999999")
      .set("Authorization", `Bearer ${clienteToken}`)
      .expect(404);
  });
});

describe("POST /api/espacios", () => {
  it("impide a un cliente crear espacios", async () => {
    const response = await request(app)
      .post("/api/espacios")
      .set("Authorization", `Bearer ${clienteToken}`)
      .send({ nombre: "Sala X", tipo: "sala", capacidad: 4, tarifaHora: 10_000, zona: "Planta 3" })
      .expect(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });

  it("valida el cuerpo con Zod", async () => {
    const response = await request(app)
      .post("/api/espacios")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ nombre: "X" })
      .expect(422);
    expect(response.body.error.details.length).toBeGreaterThan(0);
  });

  it("crea, lee y elimina un espacio", async () => {
    const nombre = `Sala de pruebas ${suffix}`;

    const creado = await request(app)
      .post("/api/espacios")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ nombre, tipo: "sala", capacidad: 5, tarifaHora: 12_000, zona: "Planta 9" })
      .expect(201);
    const id = creado.body.id as number;
    expect(creado.body.nombre).toBe(nombre);
    expect(creado.body.estado).toBe("disponible");

    const leido = await request(app)
      .get(`/api/espacios/${id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(leido.body.id).toBe(id);

    await request(app)
      .delete(`/api/espacios/${id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(204);

    await request(app)
      .get(`/api/espacios/${id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(404);
  });

  it("rechaza un nombre duplicado", async () => {
    const nombre = `Sala duplicada ${suffix}`;
    const payload = { nombre, tipo: "sala", capacidad: 3, tarifaHora: 5_000, zona: "Planta 9" };

    const creado = await request(app)
      .post("/api/espacios")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(payload)
      .expect(201);

    const repetido = await request(app)
      .post("/api/espacios")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(payload)
      .expect(409);
    expect(repetido.body.error.code).toBe("CONFLICT");

    await request(app)
      .delete(`/api/espacios/${creado.body.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(204);
  });

  it("actualiza parcialmente un espacio", async () => {
    const nombre = `Mesa editable ${suffix}`;
    const creado = await request(app)
      .post("/api/espacios")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ nombre, tipo: "mesa", capacidad: 2, tarifaHora: 0, zona: "Café" })
      .expect(201);

    const actualizado = await request(app)
      .patch(`/api/espacios/${creado.body.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ estado: "mantenimiento" })
      .expect(200);
    expect(actualizado.body.estado).toBe("mantenimiento");
    expect(actualizado.body.nombre).toBe(nombre); // no se pierde lo no enviado

    await request(app)
      .delete(`/api/espacios/${creado.body.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(204);
  });
});

describe("rotación de refresh token", () => {
  /** Extrae el valor del refresh token de las cabeceras Set-Cookie. */
  function refreshCookieOf(headers: unknown): string {
    const cookies = (headers as Record<string, string[]>)["set-cookie"] ?? [];
    const match = cookies.find((c) => c.startsWith("kairo.refresh="));
    if (!match) throw new Error("La respuesta no estableció la cookie de refresco");
    return match.split(";")[0] ?? "";
  }

  it("reutilizar un token rotado revoca la familia completa", async () => {
    const login1 = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@kairo.local", password: PASSWORD })
      .expect(200);
    const primerToken = refreshCookieOf(login1.headers);

    // Primer refresh: rota el token y emite uno nuevo.
    const refresh1 = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", primerToken)
      .expect(200);
    const segundoToken = refreshCookieOf(refresh1.headers);
    expect(segundoToken).not.toBe(primerToken);

    // Reutilizar el token ya rotado es la señal de robo de credenciales.
    const reutilizado = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", primerToken)
      .expect(401);
    expect(reutilizado.body.error.message).toMatch(/seguridad/i);

    // La familia queda revocada: tampoco vale el token emitido legítimo.
    await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", segundoToken)
      .expect(401);
  });

  it("refresh sin cookie responde 401", async () => {
    const response = await request(app).post("/api/auth/refresh").expect(401);
    expect(response.body.error.code).toBe("UNAUTHENTICATED");
  });
});

describe("protección de datos", () => {
  it("no expone el hash de la contraseña en /me", async () => {
    const response = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(response.body.user.passwordHash).toBeUndefined();
    expect(response.body.user).not.toHaveProperty("password");
  });

  it("aplica cabeceras de seguridad de Helmet", async () => {
    const response = await request(app).get("/api/health/live").expect(200);
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-powered-by"]).toBeUndefined();
  });
});

describe("hash de contraseñas", () => {
  it("las contraseñas sembradas no están en claro", async () => {
    const usuario = await prisma.usuario.findUnique({
      where: { email: "admin@kairo.local" },
      select: { passwordHash: true },
    });
    expect(usuario).not.toBeNull();
    expect(usuario!.passwordHash).not.toBe(PASSWORD);
    expect(usuario!.passwordHash.startsWith("$2")).toBe(true);
    expect(await bcrypt.compare(PASSWORD, usuario!.passwordHash)).toBe(true);
  });
});