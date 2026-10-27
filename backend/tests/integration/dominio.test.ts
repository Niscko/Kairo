import { randomUUID } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../../src/app.js";

/**
 * Pruebas de integración de los módulos de dominio contra la base real.
 */
const prisma = new PrismaClient();
const app = createApp();

const PASSWORD = "kairo123";
const suffix = randomUUID().slice(0, 8);

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

/** Fecha local en "YYYY-MM-DD", con días de margen sobre hoy. */
function fecha(offsetDias: number): string {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + offsetDias);
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}`;
}

// ---------------------------------------------------------------------------

describe("GET /api/dashboard", () => {
  it("devuelve el panel completo a la dirección", async () => {
    const response = await request(app)
      .get("/api/dashboard")
      .set(as(adminToken))
      .expect(200);

    expect(response.body.rol).toBe("admin");
    expect(Array.isArray(response.body.espacios)).toBe(true);
    expect(response.body.serie).toHaveLength(7);
    expect(response.body.ventasHoy).toHaveProperty("total");
    // Solo la dirección ve los costos pendientes.
    expect(response.body.costosPendientesTotal).toBeDefined();
  });

  it("omite los costos al cliente y le muestra su consumo", async () => {
    const response = await request(app)
      .get("/api/dashboard")
      .set(as(clienteToken))
      .expect(200);

    expect(response.body.rol).toBe("cliente");
    expect(response.body.costosPendientes).toBeUndefined();
    expect(response.body.costosPendientesTotal).toBeUndefined();
    expect(response.body.consumoMes).toBeGreaterThanOrEqual(0);
  });

  it("exige autenticación", async () => {
    await request(app).get("/api/dashboard").expect(401);
  });
});

// ---------------------------------------------------------------------------

describe("POST /api/reservas", () => {
  it("crea una reserva para un cliente y calcula el monto", async () => {
    const espacio = await prisma.espacio.findFirstOrThrow({
      where: { tipo: "sala", estado: "disponible" },
    });
    const dia = fecha(3);

    const response = await request(app)
      .post("/api/reservas")
      .set(as(clienteToken))
      .send({
        espacioId: espacio.id,
        inicio: `${dia} 08:00`,
        fin: `${dia} 10:00`,
        proposito: "reunion",
      })
      .expect(201);

    expect(response.body.monto).toBeGreaterThan(0);
    expect(response.body.incluido).toBe(false);

    await prisma.reserva.delete({ where: { id: response.body.id } });
  });

  it("cubre la reserva con la membresía mensual del cliente", async () => {
    const puesto = await prisma.espacio.findFirstOrThrow({
      where: { tipo: "puesto", estado: "disponible" },
    });
    const dia = fecha(4);

    const response = await request(app)
      .post("/api/reservas")
      .set(as(clienteToken))
      .send({
        espacioId: puesto.id,
        inicio: `${dia} 08:00`,
        fin: `${dia} 10:00`,
        proposito: "trabajo",
      })
      .expect(201);

    // Valentina tiene membresía mensual: un puesto le queda cubierto.
    expect(response.body.monto).toBe(0);
    expect(response.body.incluido).toBe(true);

    await prisma.reserva.delete({ where: { id: response.body.id } });
  });

  it("rechaza un espacio ya reservado en el mismo horario", async () => {
    const espacio = await prisma.espacio.findFirstOrThrow({
      where: { tipo: "sala", estado: "disponible" },
    });
    const dia = fecha(5);
    const payload = {
      espacioId: espacio.id,
      inicio: `${dia} 09:00`,
      fin: `${dia} 11:00`,
      proposito: "reunion",
    };

    const primera = await request(app)
      .post("/api/reservas")
      .set(as(clienteToken))
      .send(payload)
      .expect(201);

    const segunda = await request(app)
      .post("/api/reservas")
      .set(as(clienteToken))
      .send(payload)
      .expect(409);
    expect(segunda.body.error.message).toMatch(/ya está reservado/);

    await prisma.reserva.delete({ where: { id: primera.body.id } });
  });

  it("rechaza un horario fuera del horario de atención", async () => {
    const espacio = await prisma.espacio.findFirstOrThrow({
      where: { tipo: "sala", estado: "disponible" },
    });
    const dia = fecha(6);

    await request(app)
      .post("/api/reservas")
      .set(as(clienteToken))
      .send({
        espacioId: espacio.id,
        inicio: `${dia} 05:00`,
        fin: `${dia} 07:00`,
        proposito: "trabajo",
      })
      .expect(422);
  });

  it("rechaza un espacio en mantenimiento", async () => {
    const espacio = await prisma.espacio.findFirstOrThrow({
      where: { tipo: "sala", estado: "disponible" },
    });
    await prisma.espacio.update({ where: { id: espacio.id }, data: { estado: "mantenimiento" } });

    const dia = fecha(7);
    await request(app)
      .post("/api/reservas")
      .set(as(clienteToken))
      .send({
        espacioId: espacio.id,
        inicio: `${dia} 08:00`,
        fin: `${dia} 10:00`,
        proposito: "trabajo",
      })
      .expect(409);

    await prisma.espacio.update({ where: { id: espacio.id }, data: { estado: "disponible" } });
  });

  it("impide que un cliente reserve en nombre de otro", async () => {
    const espacio = await prisma.espacio.findFirstOrThrow({
      where: { tipo: "sala", estado: "disponible" },
    });
    const otro = await prisma.cliente.findFirstOrThrow({
      where: { usuario: { email: "mateo@kairo.local" } },
    });
    const dia = fecha(8);

    const response = await request(app)
      .post("/api/reservas")
      .set(as(clienteToken))
      .send({
        espacioId: espacio.id,
        clienteId: otro.id,
        inicio: `${dia} 08:00`,
        fin: `${dia} 10:00`,
        proposito: "trabajo",
      })
      .expect(201);

    // La reserva queda a nombre del cliente autenticado, no del indicado.
    const reserva = await prisma.reserva.findUniqueOrThrow({
      where: { id: response.body.id },
      select: { clienteId: true },
    });
    const propio = await prisma.cliente.findFirstOrThrow({
      where: { usuario: { email: "valentina@kairo.local" } },
    });
    expect(reserva.clienteId).toBe(propio.id);

    await prisma.reserva.delete({ where: { id: response.body.id } });
  });
});

describe("GET /api/reservas", () => {
  it("un cliente solo ve sus propias reservas", async () => {
    const hoy = fecha(0);
    const response = await request(app)
      .get(`/api/reservas?dia=${hoy}`)
      .set(as(clienteToken))
      .expect(200);

    const propio = await prisma.cliente.findFirstOrThrow({
      where: { usuario: { email: "valentina@kairo.local" } },
    });
    for (const reserva of response.body.reservas) {
      expect(reserva.clienteId).toBe(propio.id);
    }
  });

  it("el personal ve todas las reservas del día", async () => {
    const hoy = fecha(0);
    const response = await request(app)
      .get(`/api/reservas?dia=${hoy}`)
      .set(as(adminToken))
      .expect(200);

    const propias = await request(app)
      .get(`/api/reservas?dia=${hoy}`)
      .set(as(clienteToken))
      .expect(200);

    expect(response.body.reservas.length).toBeGreaterThanOrEqual(propias.body.reservas.length);
  });
});

describe("PATCH /api/reservas/:id", () => {
  it("cancela una reserva propia", async () => {
    const espacio = await prisma.espacio.findFirstOrThrow({
      where: { tipo: "sala", estado: "disponible" },
    });
    const dia = fecha(9);

    const creada = await request(app)
      .post("/api/reservas")
      .set(as(clienteToken))
      .send({
        espacioId: espacio.id,
        inicio: `${dia} 08:00`,
        fin: `${dia} 10:00`,
        proposito: "trabajo",
      })
      .expect(201);

    await request(app)
      .patch(`/api/reservas/${creada.body.id}`)
      .set(as(clienteToken))
      .send({ estado: "cancelada" })
      .expect(200);

    const reserva = await prisma.reserva.findUniqueOrThrow({
      where: { id: creada.body.id },
      select: { estado: true },
    });
    expect(reserva.estado).toBe("cancelada");
  });

  it("no permite cambiar el estado a algo distinto de cancelada", async () => {
    const espacio = await prisma.espacio.findFirstOrThrow({
      where: { tipo: "sala", estado: "disponible" },
    });
    const dia = fecha(10);

    const creada = await request(app)
      .post("/api/reservas")
      .set(as(clienteToken))
      .send({
        espacioId: espacio.id,
        inicio: `${dia} 08:00`,
        fin: `${dia} 10:00`,
        proposito: "trabajo",
      })
      .expect(201);

    await request(app)
      .patch(`/api/reservas/${creada.body.id}`)
      .set(as(clienteToken))
      .send({ estado: "completada" })
      .expect(422);

    await prisma.reserva.delete({ where: { id: creada.body.id } });
  });
});

// ---------------------------------------------------------------------------

describe("POST /api/ventas", () => {
  it("registra una venta y descuenta el inventario según la receta", async () => {
    const producto = await prisma.producto.findFirstOrThrow({
      where: { nombre: "Americano", activo: true },
    });
    const insumo = await prisma.recetaItem.findFirstOrThrow({
      where: { productoId: producto.id },
      select: { insumoId: true, cantidad: true },
    });
    const stockAntes = await prisma.insumo.findUniqueOrThrow({
      where: { id: insumo.insumoId },
      select: { stock: true },
    });

    const response = await request(app)
      .post("/api/ventas")
      .set(as(baristaToken))
      .send({
        metodoPago: "efectivo",
        items: [{ productoId: producto.id, cantidad: 2 }],
      })
      .expect(201);

    expect(response.body.total).toBe(producto.precio * 2);

    const stockDespues = await prisma.insumo.findUniqueOrThrow({
      where: { id: insumo.insumoId },
      select: { stock: true },
    });
    expect(stockDespues.stock).toBeCloseTo(
      stockAntes.stock - insumo.cantidad * 2,
      5,
    );

    await prisma.venta.delete({ where: { id: response.body.id } });
    await prisma.insumo.update({
      where: { id: insumo.insumoId },
      data: { stock: stockAntes.stock },
    });
  });

  it("exige confirmar la mayoría de edad si el pedido incluye alcohol", async () => {
    const producto = await prisma.producto.findFirstOrThrow({
      where: { nombre: "Cerveza artesanal" },
    });

    await request(app)
      .post("/api/ventas")
      .set(as(baristaToken))
      .send({
        metodoPago: "efectivo",
        items: [{ productoId: producto.id, cantidad: 1 }],
      })
      .expect(422);
  });

  it("acepta la venta de alcohol con la confirmación de edad", async () => {
    const producto = await prisma.producto.findFirstOrThrow({
      where: { nombre: "Cerveza artesanal" },
    });

    const response = await request(app)
      .post("/api/ventas")
      .set(as(baristaToken))
      .send({
        metodoPago: "tarjeta",
        items: [{ productoId: producto.id, cantidad: 1 }],
        mayorEdad: true,
      })
      .expect(201);

    await prisma.venta.delete({ where: { id: response.body.id } });
  });

  it("rechaza un pedido vacío", async () => {
    await request(app)
      .post("/api/ventas")
      .set(as(baristaToken))
      .send({ metodoPago: "efectivo", items: [] })
      .expect(422);
  });

  it("rechaza un medio de pago inválido", async () => {
    await request(app)
      .post("/api/ventas")
      .set(as(baristaToken))
      .send({ metodoPago: "bitcoin", items: [{ productoId: 1, cantidad: 1 }] })
      .expect(422);
  });
});

// ---------------------------------------------------------------------------

describe("POST /api/movimientos", () => {
  it("un ingreso suma al stock", async () => {
    const insumo = await prisma.insumo.findFirstOrThrow();
    const stockAntes = insumo.stock;

    const response = await request(app)
      .post("/api/movimientos")
      .set(as(baristaToken))
      .send({ insumoId: insumo.id, tipo: "entrada", cantidad: 5, motivo: "Prueba" })
      .expect(201);

    const despues = await prisma.insumo.findUniqueOrThrow({
      where: { id: insumo.id },
      select: { stock: true },
    });
    expect(despues.stock).toBeCloseTo(stockAntes + 5, 5);

    await prisma.movimientoInventario.delete({ where: { id: response.body.id } });
    await prisma.insumo.update({ where: { id: insumo.id }, data: { stock: stockAntes } });
  });

  it("una salida sin stock suficiente se rechaza", async () => {
    const insumo = await prisma.insumo.findFirstOrThrow();

    await request(app)
      .post("/api/movimientos")
      .set(as(baristaToken))
      .send({ insumoId: insumo.id, tipo: "salida", cantidad: 999_999 })
      .expect(409);
  });
});

// ---------------------------------------------------------------------------

describe("POST /api/turnos", () => {
  it("crea un turno sin cruzar con otro del mismo día", async () => {
    const empleado = await prisma.empleado.findFirstOrThrow();
    const dia = fecha(11);

    const response = await request(app)
      .post("/api/turnos")
      .set(as(adminToken))
      .send({
        empleadoId: empleado.id,
        fecha: dia,
        horaInicio: "06:00",
        horaFin: "07:00",
        area: "Prueba",
      })
      .expect(201);

    await prisma.turno.delete({ where: { id: response.body.id } });
  });

  it("rechaza un turno que se cruza con otro existente", async () => {
    const turno = await prisma.turno.findFirstOrThrow();
    const empleado = await prisma.empleado.findFirstOrThrow({
      where: { id: turno.empleadoId },
    });

    // La fecha del turno se lee en UTC: el turno es un día sin hora.
    const dia = `${turno.fecha.getUTCFullYear()}-${String(turno.fecha.getUTCMonth() + 1).padStart(2, "0")}-${String(turno.fecha.getUTCDate()).padStart(2, "0")}`;

    await request(app)
      .post("/api/turnos")
      .set(as(adminToken))
      .send({
        empleadoId: empleado.id,
        fecha: dia,
        horaInicio: turno.horaInicio,
        horaFin: turno.horaFin,
        area: "Prueba",
      })
      .expect(409);
  });

  it("un empleado no puede crear turnos", async () => {
    await request(app)
      .post("/api/turnos")
      .set(as(baristaToken))
      .send({
        empleadoId: 1,
        fecha: fecha(12),
        horaInicio: "06:00",
        horaFin: "07:00",
        area: "Prueba",
      })
      .expect(403);
  });
});

// ---------------------------------------------------------------------------

describe("POST /api/experiencias", () => {
  it("crea una experiencia con su reserva de espacio", async () => {
    const espacio = await prisma.espacio.findFirstOrThrow({
      where: { tipo: "evento", estado: "disponible" },
    });
    const dia = fecha(13);

    const response = await request(app)
      .post("/api/experiencias")
      .set(as(adminToken))
      .send({
        nombre: `Experiencia de prueba ${suffix}`,
        espacioId: espacio.id,
        capacidad: 10,
        precio: 15_000,
        inicio: `${dia} 18:00`,
        fin: `${dia} 20:00`,
        empleados: [],
        equipos: [],
        productos: [],
      })
      .expect(201);

    const experiencia = await prisma.experiencia.findUniqueOrThrow({
      where: { id: response.body.id },
      select: { reservaId: true, estado: true },
    });
    // La experiencia sostiene una reserva que bloquea el espacio.
    expect(experiencia.reservaId).not.toBeNull();
    expect(experiencia.estado).toBe("programada");

    // El espacio queda bloqueado para ese horario.
    const reserva = await prisma.reserva.findUniqueOrThrow({
      where: { id: experiencia.reservaId! },
      select: { proposito: true, monto: true },
    });
    expect(reserva.proposito).toBe("evento");
    expect(reserva.monto).toBe(0);

    await prisma.experiencia.delete({ where: { id: response.body.id } });
    await prisma.reserva.delete({ where: { id: experiencia.reservaId! } });
  });

  it("rechaza una capacidad mayor que la del espacio", async () => {
    const espacio = await prisma.espacio.findFirstOrThrow({
      where: { tipo: "evento", estado: "disponible" },
    });
    const dia = fecha(14);

    await request(app)
      .post("/api/experiencias")
      .set(as(adminToken))
      .send({
        nombre: `Capacidad excesiva ${suffix}`,
        espacioId: espacio.id,
        capacidad: espacio.capacidad + 100,
        precio: 15_000,
        inicio: `${dia} 18:00`,
        fin: `${dia} 20:00`,
      })
      .expect(409);
  });

  it("rechaza un empleado ya comprometido en ese horario", async () => {
    const espacio = await prisma.espacio.findFirstOrThrow({
      where: { tipo: "evento", estado: "disponible" },
    });
    const empleado = await prisma.empleado.findFirstOrThrow();
    const dia = fecha(15);

    const payload = {
      nombre: `Doble asignación ${suffix}`,
      espacioId: espacio.id,
      capacidad: 5,
      precio: 10_000,
      inicio: `${dia} 18:00`,
      fin: `${dia} 20:00`,
      empleados: [empleado.id],
    };

    const primera = await request(app)
      .post("/api/experiencias")
      .set(as(adminToken))
      .send(payload)
      .expect(201);

    await request(app)
      .post("/api/experiencias")
      .set(as(adminToken))
      .send({ ...payload, nombre: `Doble asignación B ${suffix}` })
      .expect(409);

    const creada = await prisma.experiencia.findUniqueOrThrow({
      where: { id: primera.body.id },
      select: { reservaId: true },
    });
    await prisma.experiencia.delete({ where: { id: primera.body.id } });
    await prisma.reserva.delete({ where: { id: creada.reservaId! } });
  });
});

// ---------------------------------------------------------------------------

describe("PATCH /api/clientes/:id", () => {
  it("actualiza la membresía de un cliente", async () => {
    const cliente = await prisma.cliente.findFirstOrThrow({
      where: { membresia: "ninguna" },
    });

    const response = await request(app)
      .patch(`/api/clientes/${cliente.id}`)
      .set(as(adminToken))
      .send({ membresia: "dia", membresiaVence: fecha(1) })
      .expect(200);

    expect(response.body.membresia).toBe("dia");
    expect(response.body.membresiaVence).toBe(fecha(1));
  });

  it("un cliente no puede consultar el listado de clientes", async () => {
    await request(app).get("/api/clientes").set(as(clienteToken)).expect(403);
  });
});

describe("POST /api/usuarios", () => {
  it("crea una cuenta de empleado con su perfil", async () => {
    const email = `nuevo.${suffix}@kairo.local`;

    const response = await request(app)
      .post("/api/usuarios")
      .set(as(adminToken))
      .send({
        nombre: "Persona de Prueba",
        email,
        password: "contrasenaSegura123",
        rol: "empleado",
        cargo: "prueba",
      })
      .expect(201);
    expect(response.body.id).toBeGreaterThan(0);

    const usuario = await prisma.usuario.findUniqueOrThrow({
      where: { email },
      include: { empleado: true },
    });
    expect(usuario.empleado).not.toBeNull();
    expect(usuario.empleado?.cargo).toBe("prueba");

    await prisma.empleado.delete({ where: { usuarioId: usuario.id } });
    await prisma.usuario.delete({ where: { id: usuario.id } });
  });

  it("rechaza un correo duplicado", async () => {
    await request(app)
      .post("/api/usuarios")
      .set(as(adminToken))
      .send({
        nombre: "Duplicado",
        email: "admin@kairo.local",
        password: "contrasenaSegura123",
        rol: "cliente",
      })
      .expect(409);
  });

  it("un empleado no puede crear cuentas", async () => {
    await request(app)
      .post("/api/usuarios")
      .set(as(baristaToken))
      .send({
        nombre: "No autorizado",
        email: `no.autorizado.${suffix}@kairo.local`,
        password: "contrasenaSegura123",
        rol: "cliente",
      })
      .expect(403);
  });
});
