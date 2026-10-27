import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../../src/app.js";

const prisma = new PrismaClient();
const app = createApp();

const PASSWORD = "kairo123";

let adminToken = "";
let clienteToken = "";

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

function as(token: string) {
  return { Authorization: `Bearer ${token}` };
}

/** Fecha de hoy en "YYYY-MM-DD", en hora local. */
function hoy(): string {
  const fecha = new Date();
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}`;
}

describe("GET /api/agenda", () => {
  it("exige autenticación", async () => {
    await request(app).get("/api/agenda").expect(401);
  });

  it("devuelve la agenda del día con sus secciones", async () => {
    const response = await request(app)
      .get("/api/agenda")
      .set(as(adminToken))
      .expect(200);

    expect(response.body.dia).toBe(hoy());
    expect(Array.isArray(response.body.reservas)).toBe(true);
    expect(Array.isArray(response.body.turnos)).toBe(true);
    expect(Array.isArray(response.body.experiencias)).toBe(true);
    expect(Array.isArray(response.body.ocupacion)).toBe(true);
    expect(Array.isArray(response.body.horasPorEspacio)).toBe(true);
  });

  it("un cliente solo ve sus propias reservas", async () => {
    const response = await request(app)
      .get("/api/agenda")
      .set(as(clienteToken))
      .expect(200);

    const propio = await prisma.cliente.findFirstOrThrow({
      where: { usuario: { email: "valentina@kairo.local" } },
    });
    for (const reserva of response.body.reservas) {
      expect(reserva.cliente).toBe("Valentina Henao");
      expect(reserva.cliente).not.toBe("");
      void propio;
    }
  });

  it("acepta un día concreto", async () => {
    const response = await request(app)
      .get("/api/agenda?dia=2026-03-10")
      .set(as(adminToken))
      .expect(200);
    expect(response.body.dia).toBe("2026-03-10");
  });

  it("rechaza un formato de fecha inválido", async () => {
    await request(app)
      .get("/api/agenda?dia=ayer")
      .set(as(adminToken))
      .expect(422);
  });
});

describe("GET /api/pedidos/disponibilidad", () => {
  it("indica cuántas unidades quedan de cada producto", async () => {
    const response = await request(app)
      .get("/api/pedidos/disponibilidad")
      .set(as(adminToken))
      .expect(200);

    const producto = await prisma.producto.findFirstOrThrow({
      where: { nombre: "Americano" },
    });
    const limite = response.body.disponibilidad[String(producto.id)];
    expect(typeof limite).toBe("number");
    expect(limite).toBeGreaterThanOrEqual(0);
  });

  it("un producto con receta se limita por el insumo que se acaba antes", async () => {
    // Se agota el café y la disponibilidad del americano debe bajar.
    const producto = await prisma.producto.findFirstOrThrow({
      where: { nombre: "Americano" },
    });
    const receta = await prisma.recetaItem.findFirstOrThrow({
      where: { productoId: producto.id, insumo: { nombre: "Café especial" } },
    });
    const insumo = await prisma.insumo.findUniqueOrThrow({
      where: { id: receta.insumoId },
    });
    const stockOriginal = insumo.stock;

    // 18 g de café por americano: con 36 g alcanza para 2.
    await prisma.insumo.update({
      where: { id: insumo.id },
      data: { stock: 36 },
    });

    const response = await request(app)
      .get("/api/pedidos/disponibilidad")
      .set(as(adminToken))
      .expect(200);

    expect(response.body.disponibilidad[String(producto.id)]).toBe(2);

    await prisma.insumo.update({ where: { id: insumo.id }, data: { stock: stockOriginal } });
  });
});

describe("POST /api/pedidos", () => {
  it("un cliente registra su pedido y se descuenta el inventario", async () => {
    const producto = await prisma.producto.findFirstOrThrow({
      where: { nombre: "Croissant", activo: true },
    });
    const receta = await prisma.recetaItem.findFirstOrThrow({
      where: { productoId: producto.id },
    });
    const stockAntes = await prisma.insumo.findUniqueOrThrow({
      where: { id: receta.insumoId },
      select: { stock: true },
    });

    const response = await request(app)
      .post("/api/pedidos")
      .set(as(clienteToken))
      .send({
        metodoPago: "efectivo",
        items: [{ productoId: producto.id, cantidad: 2 }],
      })
      .expect(201);

    expect(response.body.total).toBe(producto.precio * 2);

    const stockDespues = await prisma.insumo.findUniqueOrThrow({
      where: { id: receta.insumoId },
      select: { stock: true },
    });
    expect(stockDespues.stock).toBeCloseTo(
      stockAntes.stock - receta.cantidad * 2,
      5,
    );

    // La venta queda asociada al cliente.
    const venta = await prisma.venta.findUniqueOrThrow({
      where: { id: response.body.ventaId },
      include: { cliente: { include: { usuario: { select: { email: true } } } } },
    });
    expect(venta.cliente?.usuario.email).toBe("valentina@kairo.local");

    await prisma.venta.delete({ where: { id: response.body.ventaId } });
    await prisma.insumo.update({
      where: { id: receta.insumoId },
      data: { stock: stockAntes.stock },
    });
  });

  it("rechaza un pedido vacío", async () => {
    await request(app)
      .post("/api/pedidos")
      .set(as(clienteToken))
      .send({ metodoPago: "efectivo", items: [] })
      .expect(422);
  });

  it("exige confirmar la edad si el pedido incluye alcohol", async () => {
    const producto = await prisma.producto.findFirstOrThrow({
      where: { nombre: "Cerveza artesanal" },
    });

    await request(app)
      .post("/api/pedidos")
      .set(as(clienteToken))
      .send({
        metodoPago: "efectivo",
        items: [{ productoId: producto.id, cantidad: 1 }],
      })
      .expect(422);
  });
});

describe("exportaciones CSV", () => {
  it("exporta las ventas como CSV", async () => {
    const response = await request(app)
      .get("/api/exportaciones/ventas.csv?rango=21d")
      .set(as(adminToken))
      .expect(200);

    expect(response.headers["content-type"]).toContain("text/csv");
    expect(response.headers["content-disposition"]).toContain("ventas-");
    expect(response.text).toContain("Fecha;");
    expect(response.text).toContain("Producto;");
  });

  it("exporta las reservas como CSV", async () => {
    const response = await request(app)
      .get("/api/exportaciones/reservas.csv?rango=21d")
      .set(as(adminToken))
      .expect(200);

    expect(response.text).toContain("Espacio;");
    expect(response.text).toContain("Cliente;");
  });

  it("exporta el inventario como CSV", async () => {
    const response = await request(app)
      .get("/api/exportaciones/inventario.csv")
      .set(as(adminToken))
      .expect(200);

    expect(response.text).toContain("Insumo;");
    expect(response.text).toContain("Existencia;");
  });

  it("un cliente no puede exportar", async () => {
    await request(app)
      .get("/api/exportaciones/ventas.csv")
      .set(as(clienteToken))
      .expect(403);
  });
});
