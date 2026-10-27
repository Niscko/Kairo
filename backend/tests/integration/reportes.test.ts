import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../../src/app.js";

const prisma = new PrismaClient();
const app = createApp();

const PASSWORD = "kairo123";

let adminToken = "";
let baristaToken = "";
let clienteToken = "";

beforeAll(async () => {
  await prisma.$connect();
  adminToken = await login("admin@kairo.local");
  baristaToken = await login("barista@kairo.local");
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

describe("GET /api/reportes", () => {
  it("exige autenticación", async () => {
    await request(app).get("/api/reportes").expect(401);
  });

  it("solo la dirección puede verlo: el personal recibe 403", async () => {
    await request(app).get("/api/reportes").set(as(baristaToken)).expect(403);
    await request(app).get("/api/reportes").set(as(clienteToken)).expect(403);
  });

  it("devuelve la estructura completa del reporte", async () => {
    const response = await request(app)
      .get("/api/reportes?rango=21d")
      .set(as(adminToken))
      .expect(200);

    expect(response.body.rango).toBe("21d");
    expect(response.body).toHaveProperty("desde");
    expect(response.body).toHaveProperty("hasta");
    expect(response.body.ingresos).toHaveProperty("ventas");
    expect(response.body.ingresos).toHaveProperty("total");
    expect(response.body.egresos).toHaveProperty("fijos");
    expect(response.body.egresos).toHaveProperty("insumos");
    expect(response.body.egresos).toHaveProperty("detalle");
    expect(Array.isArray(response.body.utilizacion)).toBe(true);
    expect(Array.isArray(response.body.demanda)).toBe(true);
    expect(Array.isArray(response.body.flujo)).toBe(true);
    expect(Array.isArray(response.body.topProductos)).toBe(true);
    expect(Array.isArray(response.body.experiencias)).toBe(true);
  });

  it("la serie de demanda cubre las horas de atención", async () => {
    const response = await request(app)
      .get("/api/reportes?rango=7d")
      .set(as(adminToken))
      .expect(200);

    // De 07:00 a 22:00, ambas franjas incluidas.
    expect(response.body.demanda).toHaveLength(16);
    expect(response.body.demanda[0].hora).toBe(7);
    expect(response.body.demanda.at(-1).hora).toBe(22);
  });

  it("el flujo diario tiene un punto por cada día del período", async () => {
    const response = await request(app)
      .get("/api/reportes?rango=7d")
      .set(as(adminToken))
      .expect(200);

    expect(response.body.flujo).toHaveLength(7);
  });

  it("el rango de hoy cubre un solo día", async () => {
    const response = await request(app)
      .get("/api/reportes?rango=hoy")
      .set(as(adminToken))
      .expect(200);

    expect(response.body.flujo).toHaveLength(1);
  });

  it("acepta un rango personalizado", async () => {
    const response = await request(app)
      .get("/api/reportes?rango=custom&desde=2026-03-01&hasta=2026-03-10")
      .set(as(adminToken))
      .expect(200);

    expect(response.body.desde).toBe("2026-03-01");
    expect(response.body.hasta).toBe("2026-03-10");
    expect(response.body.flujo).toHaveLength(10);
  });

  it("rechaza un rango personalizado con un formato de fecha inválido", async () => {
    // El formato se valida en el borde, antes de resolver el período.
    const response = await request(app)
      .get("/api/reportes?rango=custom&desde=basura&hasta=2026-03-10")
      .set(as(adminToken))
      .expect(422);

    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rechaza un rango personalizado sin las dos fechas", async () => {
    // Con formato válido pero sin fecha, lo rechaza la resolución del período.
    const response = await request(app)
      .get("/api/reportes?rango=custom&desde=2026-03-10")
      .set(as(adminToken))
      .expect(422);

    expect(response.body.error.message).toMatch(/fecha inicial y una final/);
  });

  it("rechaza un rango invertido", async () => {
    await request(app)
      .get("/api/reportes?rango=custom&desde=2026-03-10&hasta=2026-03-01")
      .set(as(adminToken))
      .expect(422);
  });

  it("el margen es la diferencia entre ingresos y egresos", async () => {
    const response = await request(app)
      .get("/api/reportes?rango=21d")
      .set(as(adminToken))
      .expect(200);

    const { ingresos, egresos, margenRealizado } = response.body;
    expect(margenRealizado).toBe(ingresos.total - egresos.total);
  });

  it("los ingresos por reservas separan lo realizado de lo previsto", async () => {
    const response = await request(app)
      .get("/api/reportes?rango=21d")
      .set(as(adminToken))
      .expect(200);

    const { reservasRealizadas, reservasPrevistas, total } = response.body.ingresos;
    // Lo previsto no está dentro del total: todavía no se ha facturado.
    expect(total).toBeLessThan(reservasRealizadas + reservasPrevistas + response.body.ingresos.ventas);
  });
});

describe("costo de insumos en el reporte", () => {
  it("usa el factor de conversión de unidades", async () => {
    // 18 g de café a 4.20 el gramo (4200 el kilo) son 75,60, no 75.600.
    const cafe = await prisma.insumo.findFirstOrThrow({ where: { nombre: "Café especial" } });
    expect(cafe.factorConversion).toBe(1_000);

    const americano = await prisma.producto.findFirstOrThrow({
      where: { nombre: "Americano" },
    });
    const receta = await prisma.recetaItem.findMany({
      where: { productoId: americano.id },
      include: { insumo: true },
    });

    const costoUnitario = receta.reduce(
      (suma, linea) =>
        suma + linea.cantidad * (linea.insumo.costoUnitario / linea.insumo.factorConversion),
      0,
    );
    // Café (75,60) + vaso (180) + azúcar (15) = 270,60.
    expect(costoUnitario).toBeCloseTo(270.6, 1);
  });

  it("el costo de insumos del reporte es proporcional a lo vendido", async () => {
    const response = await request(app)
      .get("/api/reportes?rango=21d")
      .set(as(adminToken))
      .expect(200);

    // Con un café a 4,20 el gramo, el costo de insumos no puede ser millones.
    expect(response.body.egresos.insumos).toBeLessThan(2_000_000);
    expect(response.body.egresos.insumos).toBeGreaterThan(0);
  });
});
