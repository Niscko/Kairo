import { randomUUID } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../../src/app.js";
import { iniciarSesion, soloLectura, type Sesion } from "./helpers.js";

/**
 * La bitácora se escribe al responder un alta o una baja real.
 * Requisito: base sembrada (`pnpm seed`) y migración de registros aplicada.
 */
const prisma = new PrismaClient();
const app = createApp();

let admin: Sesion;
let cliente: Sesion;
const nombre = `Auditoría ${randomUUID().slice(0, 8)}`;
let espacioId: number | null = null;

beforeAll(async () => {
  await prisma.$connect();
  admin = await iniciarSesion(app, "admin@kairo.local");
  cliente = await iniciarSesion(app, "valentina@kairo.local");
});

afterAll(async () => {
  if (espacioId) {
    await prisma.espacio.deleteMany({ where: { id: espacioId } });
  }
  await prisma.$disconnect();
});

describe("registro de actividad", () => {
  it("un cliente no puede leer la bitácora", async () => {
    const response = await request(app)
      .get("/api/registros")
      .set(soloLectura(cliente.token))
      .expect(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });

  it("guarda el alta y la baja de un espacio", async () => {
    const creado = await request(app)
      .post("/api/espacios")
      .set(admin.headers)
      .send({
        nombre,
        tipo: "sala",
        capacidad: 4,
        tarifaHora: 1000,
        zona: "Auditoría",
      })
      .expect(201);

    espacioId = creado.body.id as number;

    const altas = await request(app)
      .get("/api/registros")
      .query({ accion: "crear", entidad: "espacios", pageSize: 20 })
      .set(soloLectura(admin.token))
      .expect(200);

    const alta = (
      altas.body.datos as Array<{ entidadId: string; detalle: { nombre?: string } }>
    ).find((fila) => fila.entidadId === String(espacioId));
    expect(alta?.detalle.nombre).toBe(nombre);

    await request(app).delete(`/api/espacios/${espacioId}`).set(admin.headers).expect(204);

    const bajas = await request(app)
      .get("/api/registros")
      .query({ accion: "eliminar", entidad: "espacios", pageSize: 20 })
      .set(soloLectura(admin.token))
      .expect(200);

    const baja = (bajas.body.datos as Array<{ entidadId: string }>).find(
      (fila) => fila.entidadId === String(espacioId),
    );
    expect(baja).toBeTruthy();
    espacioId = null;
  });

  it("entrar al sistema no queda en la bitácora", async () => {
    await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@kairo.local", password: "kairo123" })
      .expect(200);

    const response = await request(app)
      .get("/api/registros")
      .query({ entidad: "auth" })
      .set(soloLectura(admin.token))
      .expect(200);

    expect(response.body.total).toBe(0);
  });
});
