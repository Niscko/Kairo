/**
 * Semilla de datos de demostración.
 *
 * Es idempotente: si detecta que ya existen los usuarios base, no hace nada.
 * Para regenerar desde cero, ejecuta `prisma migrate reset` (borra y recrea)
 * o `make db-reset` desde la raíz.
 *
 * El escenario replica el del sistema anterior para que las demos y los
 * reportes tengan la misma forma: 21 días de historial de ventas y reservas.
 */
import bcrypt from "bcryptjs";
import { PrismaClient, type Rol, type TipoMembresia } from "@prisma/client";

import {
  addDays,
  dateISO,
  dayStamp,
  estadoPorHorario,
  hoursBetween,
  montoReserva,
  mulberry32,
  weighted,
} from "../src/lib/domain.js";

const prisma = new PrismaClient();

/** Claves de proveedor usadas por la semilla. */
type ClaveProveedor = "cafe" | "pan" | "abarrotes" | "aseo";

const PASSWORD = "kairo123";
const SEMILLA_RANDOM = 20260929;

function bcryptCost(): number {
  const raw = process.env.BCRYPT_COST;
  if (!raw) return 10;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 4 || parsed > 15) {
    throw new Error(`BCRYPT_COST inválido: ${raw}. Debe ser un entero entre 4 y 15.`);
  }
  return parsed;
}

async function main(): Promise<void> {
  const yaSembrado = await prisma.usuario.count();
  if (yaSembrado > 0) {
    console.log(
      `La base ya contiene ${yaSembrado} usuarios. No se siembra nada. ` +
        "Usa `prisma migrate reset` o `make db-reset` para regenerar.",
    );
    return;
  }

  const now = new Date();
  const random = mulberry32(SEMILLA_RANDOM);
  const passwordHash = bcrypt.hashSync(PASSWORD, bcryptCost());

  // --- Personal -----------------------------------------------------------
  const staff: Array<[string, string, string, string, Rol, number, string]> = [
    ["Helena Marín", "admin@kairo.local", "3004102201", "administrador", "admin", 4_500_000, "2024-01-15"],
    ["Camila Restrepo", "barista@kairo.local", "3004102202", "barista", "empleado", 1_900_000, "2024-06-01"],
    ["Julián Ortiz", "cocina@kairo.local", "3004102203", "cocina", "empleado", 1_850_000, "2024-08-12"],
    ["Sara Vélez", "sala@kairo.local", "3004102204", "atencion", "empleado", 1_750_000, "2025-02-03"],
    ["Andrés Cano", "aseo@kairo.local", "3004102205", "aseo", "empleado", 1_550_000, "2025-04-20"],
  ];

  const empleadoPorNombre = new Map<string, number>();
  const empleadoPorCargo = new Map<string, number>();

  for (const [nombre, email, telefono, cargo, rol, salario, ingreso] of staff) {
    const usuario = await prisma.usuario.create({
      data: { nombre, email, passwordHash, rol, telefono },
    });
    const empleado = await prisma.empleado.create({
      data: {
        usuarioId: usuario.id,
        cargo,
        salario,
        fechaIngreso: dayStamp(new Date(`${ingreso}T00:00:00`), "00:00"),
      },
    });
    empleadoPorNombre.set(nombre, empleado.id);
    empleadoPorCargo.set(cargo, empleado.id);
  }

  // Cuenta desactivada: sirve para demostrar que el login la rechaza.
  const inactivo = await prisma.usuario.create({
    data: {
      nombre: "Inés Mora",
      email: "inactivo@kairo.local",
      passwordHash,
      rol: "cliente",
      telefono: "3005103399",
      activo: false,
    },
  });
  await prisma.cliente.create({
    data: { usuarioId: inactivo.id, documento: "1002003099", membresia: "ninguna" },
  });

  // --- Clientes -----------------------------------------------------------
  const venceMensual = dateISO(new Date(now.getFullYear(), now.getMonth() + 2, 0));
  const venceDia = dateISO(now);
  const venceDiaLargo = dateISO(addDays(now, 3));

  const clients: Array<[string, string, string, string, string, string | null]> = [
    ["Valentina Henao", "valentina@kairo.local", "3005103301", "1002003001", "mensual", venceMensual],
    ["Tomás Giraldo", "tomas@kairo.local", "3005103302", "1002003002", "mensual", venceMensual],
    ["Samuel Quintero", "samuel@kairo.local", "3005103303", "1002003003", "mensual", venceMensual],
    ["Felipe Castro", "felipe@kairo.local", "3005103304", "1002003004", "dia", venceDia],
    ["Lucía Cárdenas", "lucia@kairo.local", "3005103305", "1002003005", "dia", venceDiaLargo],
    ["Mateo Ríos", "mateo@kairo.local", "3005103306", "1002003006", "ninguna", null],
    ["Elena Vargas", "elena@kairo.local", "3005103307", "1002003007", "ninguna", null],
    ["Mariana López", "mariana@kairo.local", "3005103308", "1002003008", "ninguna", null],
    ["Pablo Mejía", "pablo@kairo.local", "3005103309", "1002003009", "ninguna", null],
    ["Renata Gil", "renata@kairo.local", "3005103310", "1002003010", "ninguna", null],
  ];

  const clientePorNombre = new Map<string, { id: number; membresia: string; vence: Date | null }>();
  const pagadores: Array<{ id: number }> = [];
  const miembros: Array<{ id: number }> = [];

  for (const [nombre, email, telefono, documento, membresia, vence] of clients) {
    const usuario = await prisma.usuario.create({
      data: { nombre, email, passwordHash, rol: "cliente", telefono },
    });
    const cliente = await prisma.cliente.create({
      data: {
        usuarioId: usuario.id,
        documento,
        membresia: membresia as TipoMembresia,
        membresiaVence: vence ? dayStamp(new Date(`${vence}T00:00:00`), "00:00") : null,
      },
    });
    const record = {
      id: cliente.id,
      membresia,
      vence: vence ? dayStamp(new Date(`${vence}T00:00:00`), "00:00") : null,
    };
    clientePorNombre.set(nombre, record);
    if (membresia === "ninguna") pagadores.push(cliente);
    else if (membresia === "mensual") miembros.push(cliente);
  }

  // --- Espacios -----------------------------------------------------------
  const espacios: Array<[string, "puesto" | "sala" | "mesa" | "evento", number, number, string]> = [
    ["Puesto 01 · Ventana", "puesto", 1, 8_000, "Planta 1"],
    ["Puesto 02 · Ventana", "puesto", 1, 8_000, "Planta 1"],
    ["Puesto 03 · Ventana", "puesto", 1, 8_000, "Planta 1"],
    ["Puesto 04 · Jardín", "puesto", 1, 7_000, "Planta 1"],
    ["Puesto 05 · Jardín", "puesto", 1, 7_000, "Planta 1"],
    ["Puesto 06 · Barra", "puesto", 1, 6_000, "Planta 1"],
    ["Sala Roble", "sala", 6, 35_000, "Planta 2"],
    ["Sala Ceiba", "sala", 10, 55_000, "Planta 2"],
    ["Mesa 01", "mesa", 2, 0, "Café"],
    ["Mesa 02", "mesa", 4, 0, "Café"],
    ["Mesa 03", "mesa", 4, 0, "Café"],
    ["Mesa 04 · Sofá", "mesa", 4, 0, "Café"],
    ["Terraza", "evento", 40, 180_000, "Exterior"],
  ];

  const espacioPorNombre = new Map<string, { id: number; tipo: string; tarifa: number }>();
  const puestos: Array<{ id: number; nombre: string }> = [];

  for (const [nombre, tipo, capacidad, tarifa, zona] of espacios) {
    const espacio = await prisma.espacio.create({
      data: { nombre, tipo, capacidad, tarifaHora: tarifa, zona },
    });
    espacioPorNombre.set(nombre, { id: espacio.id, tipo, tarifa });
    if (tipo === "puesto") puestos.push({ id: espacio.id, nombre });
  }

  // --- Proveedores e insumos ------------------------------------------------
  const proveedores: Array<[ClaveProveedor, string, string, string, string]> = [
    ["cafe", "Finca Alto Verde", "Compras de café", "6044441122", "Café"],
    ["pan", "Panadería La Miga", "Pedidos de la mañana", "6045552211", "Panadería"],
    ["abarrotes", "Distribuciones San Juan", "Lácteos y bebidas", "6043330099", "Abarrotes"],
    ["aseo", "Limpieza Nova", "Insumos de aseo", "6042221188", "Aseo"],
  ];
  const proveedorId: Record<ClaveProveedor, number> = { cafe: 0, pan: 0, abarrotes: 0, aseo: 0 };
  for (const [clave, nombre, contacto, telefono, categoria] of proveedores) {
    const created = await prisma.proveedor.create({ data: { nombre, contacto, telefono, categoria } });
    proveedorId[clave] = created.id;
  }

  // [nombre, unidad, stockInicial, stockMinimo, proveedor, costoUnitario, unidadCompra, factor]
  //
  // `costoUnitario` es el precio de UNA unidad de compra (un kilo de café
  // cuesta 4200). `factor` indica cuántas unidades de stock tiene esa unidad
  // de compra: un kilo son 1000 gramos. Sin el factor, una receta de 18 g de
  // café costaría 18 × 4200 en lugar de 18 × 4,20.
  const insumos: Array<
    [string, string, number, number, ClaveProveedor, number, string, number]
  > = [
    ["Café especial", "g", 1_000, 80, "cafe", 4_200, "kg", 1_000],
    ["Leche entera", "ml", 5_000, 4, "abarrotes", 18_000, "L", 1_000],
    ["Leche de avena", "ml", 4_000, 8, "abarrotes", 1_200, "L", 1_000],
    ["Agua", "ml", 2_000, 1, "abarrotes", 20_000, "L", 1_000],
    ["Azúcar", "g", 500, 5, "abarrotes", 3_000, "kg", 1_000],
    ["Hielo", "g", 2_000, 1, "abarrotes", 8_000, "kg", 1_000],
    ["Vaso 8 oz", "un", 50, 180, "abarrotes", 180, "unidad", 1],
    ["Vaso 12 oz", "un", 40, 220, "abarrotes", 90, "unidad", 1],
    ["Pan croissant", "un", 10, 2_800, "pan", 600, "unidad", 1],
    ["Pan baguette", "un", 8, 2_200, "pan", 1_400, "unidad", 1],
    ["Queso", "g", 500, 28, "abarrotes", 1_800, "kg", 1_000],
    ["Jamón", "g", 400, 32, "abarrotes", 900, "kg", 1_000],
    ["Brownie", "un", 8, 3_500, "pan", 1_500, "unidad", 1],
    ["Pulpa de maracuyá", "ml", 1_000, 12, "abarrotes", 3_500, "L", 1_000],
    ["Cerveza lata", "un", 24, 4_500, "abarrotes", 4_800, "unidad", 1],
    ["Detergente", "ml", 1_000, 8, "aseo", 4_000, "L", 1_000],
    ["Papel higiénico", "un", 20, 450, "aseo", 3_600, "paquete", 1],
  ];

  const insumoPorNombre = new Map<string, { id: number; costo: number }>();
  for (const [nombre, unidad, stock, minimo, prov, costo, unidadCompra, factor] of insumos) {
    const created = await prisma.insumo.create({
      data: {
        nombre,
        unidad,
        stock,
        stockMinimo: minimo,
        costoUnitario: costo,
        unidadCompra,
        factorConversion: factor,
        proveedorId: proveedorId[prov],
      },
    });
    insumoPorNombre.set(nombre, { id: created.id, costo });
  }

  // --- Productos y recetas -------------------------------------------------
  const productos: Array<[string, "bebida" | "alimento" | "servicio", number, string, boolean]> = [
    ["Americano", "bebida", 7_000, "Espresso largo de origen Huila.", false],
    ["Latte", "bebida", 9_000, "Espresso con leche entera texturizada.", false],
    ["Latte de avena", "bebida", 10_000, "Espresso con leche de avena.", false],
    ["Cold brew", "bebida", 11_000, "Extracción en frío, doce horas.", false],
    ["Jugo de maracuyá", "bebida", 10_000, "Pulpa natural, sin azúcar añadida.", false],
    ["Cerveza artesanal", "bebida", 12_000, "Lata 355 ml. Venta a mayores de 18 años.", true],
    ["Croissant", "alimento", 7_500, "De mantequilla, horneado en la mañana.", false],
    ["Sándwich", "alimento", 22_000, "Baguette, jamón y queso.", false],
    ["Brownie", "alimento", 8_000, "Chocolate al 70%.", false],
    ["Día de cowork", "servicio", 32_000, "Acceso a un puesto durante la jornada.", false],
    ["Membresía mensual", "servicio", 280_000, "Puestos incluidos por 30 días.", false],
  ];

  const productoPorNombre = new Map<string, { id: number; precio: number; categoria: string }>();
  for (const [nombre, categoria, precio, descripcion, esAlcohol] of productos) {
    const created = await prisma.producto.create({
      data: { nombre, categoria, precio, descripcion, esAlcohol },
    });
    productoPorNombre.set(nombre, { id: created.id, precio, categoria });
  }

  const recetas: Array<[string, Array<[string, number]>]> = [
    ["Americano", [["Café especial", 18], ["Vaso 8 oz", 1], ["Azúcar", 5]]],
    ["Latte", [["Café especial", 18], ["Leche entera", 160], ["Vaso 8 oz", 1]]],
    ["Latte de avena", [["Café especial", 18], ["Leche de avena", 160], ["Vaso 8 oz", 1]]],
    ["Cold brew", [["Café especial", 30], ["Agua", 180], ["Hielo", 80], ["Vaso 12 oz", 1]]],
    ["Jugo de maracuyá", [["Pulpa de maracuyá", 220], ["Vaso 12 oz", 1]]],
    ["Cerveza artesanal", [["Cerveza lata", 1]]],
    ["Croissant", [["Pan croissant", 1]]],
    ["Sándwich", [["Pan baguette", 1], ["Queso", 40], ["Jamón", 45]]],
    ["Brownie", [["Brownie", 1]]],
  ];

  const recetaPorProducto = new Map<number, Array<{ insumoId: number; cantidad: number }>>();
  for (const [producto, items] of recetas) {
    const productoId = productoPorNombre.get(producto)?.id;
    if (productoId === undefined) throw new Error(`Producto de receta inexistente: ${producto}`);
    const lines: Array<{ insumoId: number; cantidad: number }> = [];
    for (const [insumo, cantidad] of items) {
      const insumoId = insumoPorNombre.get(insumo)?.id;
      if (insumoId === undefined) throw new Error(`Insumo de receta inexistente: ${insumo}`);
      await prisma.recetaItem.create({ data: { productoId, insumoId, cantidad } });
      lines.push({ insumoId, cantidad });
    }
    recetaPorProducto.set(productoId, lines);
  }

  console.log("✔ Identidad, espacios, catálogo e inventario sembrados");
  await sembrarOperacion({
    now,
    random,
    productoPorNombre,
    recetaPorProducto,
    insumoPorNombre,
    insumos,
    espacioPorNombre,
    puestos,
    empleadoPorNombre,
    empleadoPorCargo,
    clientePorNombre,
    pagadores,
    miembros,
  });

  console.log("\nListo. Cuentas de demostración (contraseña: %s):", PASSWORD);
  console.log("  Dirección   admin@kairo.local");
  console.log("  Barista     barista@kairo.local");
  console.log("  Cliente     valentina@kairo.local");
}

interface OperacionContext {
  now: Date;
  random: () => number;
  productoPorNombre: Map<string, { id: number; precio: number; categoria: string }>;
  recetaPorProducto: Map<number, Array<{ insumoId: number; cantidad: number }>>;
  insumoPorNombre: Map<string, { id: number; costo: number }>;
  /** Existencia final deseada de cada insumo, por nombre. */
  insumos: Array<[string, string, number, number, string, number, string, number]>;
  espacioPorNombre: Map<string, { id: number; tipo: string; tarifa: number }>;
  puestos: Array<{ id: number; nombre: string }>;
  empleadoPorNombre: Map<string, number>;
  empleadoPorCargo: Map<string, number>;
  clientePorNombre: Map<string, { id: number; membresia: string; vence: Date | null }>;
  pagadores: Array<{ id: number }>;
  miembros: Array<{ id: number }>;
}

async function sembrarOperacion(ctx: OperacionContext): Promise<void> {
  const { now, random, productoPorNombre, recetaPorProducto, espacioPorNombre } = ctx;
  const hoy = dateISO(now);
  const ahora = new Date();

  // --- Plan de ventas -----------------------------------------------------
  interface VentaPlan {
    fecha: Date;
    clienteId: number | null;
    empleadoId: number;
    metodo: "efectivo" | "tarjeta" | "transferencia";
    items: Array<{ productoId: number; precio: number; cantidad: number }>;
  }
  const plan: VentaPlan[] = [];

  const pushSale = (
    fecha: Date,
    productoNombre: string,
    cantidad: number,
    clienteId: number | null,
    empleadoId: number,
  ): void => {
    const producto = productoPorNombre.get(productoNombre);
    if (!producto) throw new Error(`Producto inexistente en el plan: ${productoNombre}`);
    const metodo = weighted(random, [
      { nombre: "tarjeta" as const, weight: 0.5 },
      { nombre: "efectivo" as const, weight: 0.3 },
      { nombre: "transferencia" as const, weight: 0.2 },
    ]);
    plan.push({
      fecha,
      clienteId,
      empleadoId,
      metodo: metodo.nombre,
      items: [{ productoId: producto.id, precio: producto.precio, cantidad }],
    });
  };

  const menu = [
    ["Americano", 0.24],
    ["Latte", 0.18],
    ["Latte de avena", 0.08],
    ["Cold brew", 0.08],
    ["Jugo de maracuyá", 0.07],
    ["Cerveza artesanal", 0.05],
    ["Croissant", 0.12],
    ["Sándwich", 0.1],
    ["Brownie", 0.08],
  ].map(([nombre, weight]) => ({ nombre: nombre as string, weight: weight as number }));

  const vendedores = [
    ctx.empleadoPorCargo.get("barista"),
    ctx.empleadoPorCargo.get("cocina"),
    ctx.empleadoPorCargo.get("atencion"),
  ].filter((id): id is number => typeof id === "number");

  const elegirProducto = () => weighted(random, menu).nombre;

  // 21 días de historial.
  for (let offset = -21; offset <= -1; offset += 1) {
    const date = addDays(now, offset);
    const dow = date.getDay();
    const count = dow === 0 ? 7 : 12 + Math.floor(random() * 5);
    for (let i = 0; i < count; i += 1) {
      const hour = 7 + Math.floor(random() * 13);
      const minute = [0, 15, 30, 45][Math.floor(random() * 4)] ?? 0;
      const cliente =
        random() > 0.45
          ? (ctx.pagadores[Math.floor(random() * ctx.pagadores.length)]?.id ?? null)
          : null;
      const empleadoId = vendedores[Math.floor(random() * vendedores.length)];
      if (empleadoId === undefined) throw new Error("No hay vendedores configurados");
      pushSale(
        dayStamp(date, `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`),
        elegirProducto(),
        random() > 0.82 ? 2 : 1,
        cliente,
        empleadoId,
      );
    }
  }

  // Ventas del día en curso.
  const ventasHoy = ["07:20", "08:05", "08:40", "09:15", "10:10", "11:05", "11:40", "12:30", "13:15", "13:50", "14:10"];
  ventasHoy.forEach((time, index) => {
    const fecha = dayStamp(new Date(`${hoy}T00:00:00`), time);
    if (fecha >= ahora) return;
    const barista = ctx.empleadoPorCargo.get("barista");
    if (barista === undefined) throw new Error("Falta el empleado barista");
    const clienteId =
      index % 3 === 0 ? (ctx.clientePorNombre.get("Valentina Henao")?.id ?? null) : null;
    pushSale(fecha, elegirProducto(), 1, clienteId, barista);
  });

  // Membresías del mes y días de cowork.
  const inicioMes = dayStamp(new Date(now.getFullYear(), now.getMonth(), 1), "08:10");
  const administrador = ctx.empleadoPorCargo.get("administrador");
  if (inicioMes < ahora && administrador !== undefined) {
    for (const miembro of ctx.miembros) {
      pushSale(inicioMes, "Membresía mensual", 1, miembro.id, administrador);
    }
  }
  const atencion = ctx.empleadoPorCargo.get("atencion");
  if (atencion !== undefined) {
    for (let i = 0; i < 5; i += 1) {
      const fecha = dayStamp(addDays(now, -2 - i * 3), "09:00");
      if (fecha >= ahora) continue;
      pushSale(fecha, "Día de cowork", 1, ctx.pagadores[i % ctx.pagadores.length]?.id ?? null, atencion);
    }
  }

  // --- Consumo calculado e inventario final --------------------------------
  const consumo = new Map<number, number>();
  for (const sale of plan) {
    for (const item of sale.items) {
      for (const line of recetaPorProducto.get(item.productoId) ?? []) {
        consumo.set(line.insumoId, (consumo.get(line.insumoId) ?? 0) + line.cantidad * item.cantidad);
      }
    }
  }
  const mermas: Array<[string, number, string]> = [["Café especial", 80, "Merma de molienda"]];
  for (const [nombre, cantidad] of mermas) {
    const insumo = ctx.insumoPorNombre.get(nombre);
    if (!insumo) throw new Error(`Insumo de merma inexistente: ${nombre}`);
    consumo.set(insumo.id, (consumo.get(insumo.id) ?? 0) + cantidad);
  }

  const fechaInventario = dayStamp(addDays(now, -21), "06:30");
  for (const [nombre, , stockFinal, , , ] of ctx.insumos) {
    const insumo = ctx.insumoPorNombre.get(nombre);
    if (!insumo) throw new Error(`Insumo de reposición inexistente: ${nombre}`);
    const usado = consumo.get(insumo.id) ?? 0;
    // Se repone lo consumido para que la existencia final sea la del catálogo.
    const inicial = usado + stockFinal;
    await prisma.insumo.update({ where: { id: insumo.id }, data: { stock: inicial } });
    await prisma.movimientoInventario.create({
      data: {
        insumoId: insumo.id,
        tipo: "entrada",
        cantidad: inicial,
        motivo: "Inventario inicial del mes",
        fecha: fechaInventario,
        referencia: "Apertura",
      },
    });
  }

  // --- Materializar ventas y descontar insumos -----------------------------
  for (const sale of plan) {
    const total = sale.items.reduce((sum, item) => sum + item.precio * item.cantidad, 0);
    const venta = await prisma.venta.create({
      data: {
        clienteId: sale.clienteId,
        empleadoId: sale.empleadoId,
        fecha: sale.fecha,
        metodoPago: sale.metodo,
        total,
      },
    });
    for (const item of sale.items) {
      await prisma.ventaItem.create({
        data: { ventaId: venta.id, productoId: item.productoId, cantidad: item.cantidad, precio: item.precio },
      });
      for (const line of recetaPorProducto.get(item.productoId) ?? []) {
        const cantidad = line.cantidad * item.cantidad;
        await prisma.insumo.update({
          where: { id: line.insumoId },
          data: { stock: { decrement: cantidad } },
        });
        await prisma.movimientoInventario.create({
          data: {
            insumoId: line.insumoId,
            tipo: "salida",
            cantidad,
            fecha: sale.fecha,
            referencia: `Venta ${venta.id}`,
          },
        });
      }
    }
  }

  for (const [nombre, cantidad, motivo] of mermas) {
    const insumo = ctx.insumoPorNombre.get(nombre);
    if (!insumo) throw new Error(`Insumo de merma inexistente: ${nombre}`);
    await prisma.insumo.update({ where: { id: insumo.id }, data: { stock: { decrement: cantidad } } });
    await prisma.movimientoInventario.create({
      data: {
        insumoId: insumo.id,
        tipo: "merma",
        cantidad,
        motivo,
        fecha: dayStamp(addDays(now, -1), "18:10"),
        referencia: "Cocina",
      },
    });
  }

  console.log(`✔ ${plan.length} ventas registradas`);

  // --- Reservas ------------------------------------------------------------
  const reservar = async (params: {
    espacioNombre: string;
    clienteNombre: string | null;
    inicio: Date;
    fin: Date;
    proposito: "trabajo" | "estudio" | "reunion" | "consumo" | "evento";
    notas: string | null;
  }): Promise<number> => {
    const espacio = espacioPorNombre.get(params.espacioNombre);
    if (!espacio) throw new Error(`Espacio inexistente: ${params.espacioNombre}`);
    const persona = params.clienteNombre ? ctx.clientePorNombre.get(params.clienteNombre) : undefined;
    if (params.clienteNombre && !persona) {
      throw new Error(`Cliente inexistente: ${params.clienteNombre}`);
    }

    const monto = montoReserva({
      hours: hoursBetween(params.inicio, params.fin),
      tarifaHora: espacio.tarifa,
      tipo: espacio.tipo as "puesto" | "sala" | "mesa" | "evento",
      membresia: (persona?.membresia ?? "ninguna") as "ninguna" | "dia" | "mensual",
      membresiaVence: persona?.vence ?? null,
      day: dateISO(params.inicio),
      proposito: params.proposito,
    });

    const reserva = await prisma.reserva.create({
      data: {
        espacioId: espacio.id,
        clienteId: persona?.id ?? null,
        inicio: params.inicio,
        fin: params.fin,
        proposito: params.proposito,
        estado: estadoPorHorario(params.inicio, params.fin, ahora),
        monto,
        notas: params.notas,
      },
    });
    return reserva.id;
  };

  const slots: Array<[string, string]> = [
    ["08:00", "12:00"],
    ["08:00", "17:00"],
    ["09:00", "13:00"],
    ["13:00", "18:00"],
    ["10:00", "16:00"],
  ];

  let reservasCreadas = 0;
  for (let offset = -21; offset <= -1; offset += 1) {
    const date = addDays(now, offset);
    const dow = date.getDay();
    for (let i = 0; i < 5; i += 1) {
      const [desde, hasta] = slots[i] as [string, string];
      const pool = i === 1 ? ctx.miembros : ctx.pagadores;
      const cliente = pool[Math.abs(offset + i) % pool.length];
      const puesto = ctx.puestos[i];
      if (!cliente || !puesto) continue;
      const clienteNombre = [...ctx.clientePorNombre.entries()].find(([, v]) => v.id === cliente.id)?.[0];
      if (!clienteNombre) continue;
      await reservar({
        espacioNombre: puesto.nombre,
        clienteNombre,
        inicio: dayStamp(date, desde),
        fin: dayStamp(date, hasta),
        proposito: "trabajo",
        notas: null,
      });
      reservasCreadas += 1;
    }
    if (dow === 2 || dow === 4) {
      const clienteNombre = [...ctx.clientePorNombre.entries()].find(
        ([, v]) => v.id === ctx.pagadores[Math.abs(offset) % ctx.pagadores.length]?.id,
      )?.[0];
      if (clienteNombre) {
        await reservar({
          espacioNombre: "Sala Roble",
          clienteNombre,
          inicio: dayStamp(date, "10:00"),
          fin: dayStamp(date, "12:00"),
          proposito: "reunion",
          notas: "Reunión de equipo",
        });
        reservasCreadas += 1;
      }
    }
    if (dow === 5) {
      const clienteNombre = [...ctx.clientePorNombre.entries()].find(
        ([, v]) => v.id === ctx.pagadores[Math.abs(offset) % ctx.pagadores.length]?.id,
      )?.[0];
      if (clienteNombre) {
        await reservar({
          espacioNombre: "Sala Ceiba",
          clienteNombre,
          inicio: dayStamp(date, "15:00"),
          fin: dayStamp(date, "17:00"),
          proposito: "reunion",
          notas: null,
        });
        reservasCreadas += 1;
      }
    }
  }

  // Reservas de hoy y mañana.
  const hoyDate = new Date(`${hoy}T00:00:00`);
  const agendaHoy: Array<[string, string | null, string, string, "trabajo" | "estudio" | "reunion" | "consumo", string | null]> = [
    ["Puesto 02 · Ventana", "Valentina Henao", "08:00", "17:00", "trabajo", "Cubierto por membresía mensual"],
    ["Puesto 05 · Jardín", "Tomás Giraldo", "10:00", "16:00", "estudio", "Cubierto por membresía mensual"],
    ["Puesto 01 · Ventana", "Mateo Ríos", "08:00", "12:00", "trabajo", null],
    ["Puesto 04 · Jardín", "Felipe Castro", "14:00", "18:00", "trabajo", "Día de cowork"],
    ["Sala Ceiba", "Elena Vargas", "14:00", "16:00", "reunion", "Revisión de propuesta"],
    ["Mesa 03", "Lucía Cárdenas", "14:00", "15:30", "consumo", null],
  ];
  for (const [espacio, cliente, desde, hasta, proposito, notas] of agendaHoy) {
    await reservar({
      espacioNombre: espacio,
      clienteNombre: cliente,
      inicio: dayStamp(hoyDate, desde),
      fin: dayStamp(hoyDate, hasta),
      proposito,
      notas,
    });
    reservasCreadas += 1;
  }

  const manana = addDays(now, 1);
  const agendaManana: Array<[string, string, string, string, "trabajo" | "estudio"]> = [
    ["Puesto 03 · Ventana", "Mateo Ríos", "09:00", "12:00", "trabajo"],
    ["Puesto 01 · Ventana", "Elena Vargas", "08:00", "11:00", "estudio"],
  ];
  for (const [espacio, cliente, desde, hasta, proposito] of agendaManana) {
    await reservar({
      espacioNombre: espacio,
      clienteNombre: cliente,
      inicio: dayStamp(manana, desde),
      fin: dayStamp(manana, hasta),
      proposito,
      notas: null,
    });
    reservasCreadas += 1;
  }

  console.log(`✔ ${reservasCreadas} reservas registradas`);

  // --- Equipos -------------------------------------------------------------
  const equipos: Array<[string, "tecnologico" | "mobiliario" | "produccion" | "administracion", "operativo" | "mantenimiento" | "prestado", string | null, number]> = [
    ["Portátil de préstamo 1", "tecnologico", "prestado", null, 3_200_000],
    ["Portátil de préstamo 2", "tecnologico", "operativo", null, 3_200_000],
    ["Monitor 27 pulgadas", "tecnologico", "mantenimiento", null, 980_000],
    ["Proyector", "tecnologico", "operativo", "Sala Ceiba", 2_100_000],
    ["Equipo de sonido", "tecnologico", "operativo", "Terraza", 4_500_000],
    ["Máquina de espresso", "produccion", "operativo", null, 12_800_000],
    ["Molino", "produccion", "operativo", null, 2_400_000],
    ["Nevera vertical", "produccion", "operativo", null, 3_100_000],
    ["Impresora", "administracion", "operativo", null, 750_000],
    ["Sofá modular", "mobiliario", "operativo", "Mesa 04 · Sofá", 1_800_000],
  ];
  const equipoPorNombre = new Map<string, number>();
  for (const [nombre, tipo, estado, espacioNombre, costo] of equipos) {
    const espacio = espacioNombre ? espacioPorNombre.get(espacioNombre) : undefined;
    const created = await prisma.equipo.create({
      data: { nombre, tipo, estado, espacioId: espacio?.id ?? null, costo },
    });
    equipoPorNombre.set(nombre, created.id);
  }

  // --- Experiencias --------------------------------------------------------
  const proximaVentana = (startTime: string, endTime: string): { inicio: Date; fin: Date } => {
    const hoyInicio = dayStamp(new Date(), startTime);
    const hoyFin = dayStamp(new Date(), endTime);
    if (hoyFin <= ahora) {
      const mananaDate = addDays(new Date(), 1);
      return { inicio: dayStamp(mananaDate, startTime), fin: dayStamp(mananaDate, endTime) };
    }
    return { inicio: hoyInicio, fin: hoyFin };
  };

  const vinilo = proximaVentana("19:00", "22:00");
  const lectura = proximaVentana("17:00", "19:00");
  if (lectura.inicio < vinilo.fin && lectura.fin > vinilo.inicio) {
    lectura.inicio = dayStamp(addDays(lectura.inicio, 1), "17:00");
    lectura.fin = dayStamp(addDays(lectura.fin, 1), "19:00");
  }

  const reservaVinilo = await reservar({
    espacioNombre: "Terraza",
    clienteNombre: null,
    inicio: vinilo.inicio,
    fin: vinilo.fin,
    proposito: "evento",
    notas: "Experiencia: Noche de vinilo",
  });
  const reservaLectura = await reservar({
    espacioNombre: "Sala Roble",
    clienteNombre: null,
    inicio: lectura.inicio,
    fin: lectura.fin,
    proposito: "evento",
    notas: "Experiencia: Club de lectura",
  });

  const estadoExperiencia = (inicio: Date, fin: Date): "programada" | "en_curso" => {
    const estado = estadoPorHorario(inicio, fin, ahora);
    return estado === "en_curso" ? "en_curso" : "programada";
  };

  const terrazaId = espacioPorNombre.get("Terraza")?.id;
  const robleId = espacioPorNombre.get("Sala Roble")?.id;
  if (terrazaId === undefined || robleId === undefined) {
    throw new Error("Faltan los espacios Terrace o Sala Roble");
  }

  const nocheVinilo = await prisma.experiencia.create({
    data: {
      nombre: "Noche de vinilo",
      descripcion: "Sesión en la terraza con música en vinilo, barra de cerveza y postres.",
      espacioId: terrazaId,
      reservaId: reservaVinilo,
      inicio: vinilo.inicio,
      fin: vinilo.fin,
      capacidad: 40,
      precio: 25_000,
      estado: estadoExperiencia(vinilo.inicio, vinilo.fin),
    },
  });

  const clubLectura = await prisma.experiencia.create({
    data: {
      nombre: "Club de lectura",
      descripcion: "Encuentro en Sala Roble. Incluye un americano de cortesía al llegar.",
      espacioId: robleId,
      reservaId: reservaLectura,
      inicio: lectura.inicio,
      fin: lectura.fin,
      capacidad: 6,
      precio: 15_000,
      estado: estadoExperiencia(lectura.inicio, lectura.fin),
    },
  });

  const linkEmpleado = (experienciaId: number, empleadoNombre: string): void => {
    const id = ctx.empleadoPorNombre.get(empleadoNombre);
    if (id === undefined) throw new Error(`Empleado inexistente: ${empleadoNombre}`);
    void prisma.experienciaEmpleado.create({ data: { experienciaId, empleadoId: id } });
  };
  const linkEquipo = (experienciaId: number, equipoNombre: string): void => {
    const id = equipoPorNombre.get(equipoNombre);
    if (id === undefined) throw new Error(`Equipo inexistente: ${equipoNombre}`);
    void prisma.experienciaEquipo.create({ data: { experienciaId, equipoId: id } });
  };
  const linkProducto = (experienciaId: number, productoNombre: string, cantidad: number): void => {
    const id = productoPorNombre.get(productoNombre)?.id;
    if (id === undefined) throw new Error(`Producto inexistente: ${productoNombre}`);
    void prisma.experienciaProducto.create({ data: { experienciaId, productoId: id, cantidad } });
  };
  const linkParticipante = (experienciaId: number, clienteNombre: string): void => {
    const id = ctx.clientePorNombre.get(clienteNombre)?.id;
    if (id === undefined) throw new Error(`Cliente inexistente: ${clienteNombre}`);
    void prisma.experienciaParticipante.create({ data: { experienciaId, clienteId: id } });
  };

  linkEmpleado(nocheVinilo.id, "Camila Restrepo");
  linkEmpleado(nocheVinilo.id, "Sara Vélez");
  linkEquipo(nocheVinilo.id, "Equipo de sonido");
  linkProducto(nocheVinilo.id, "Cerveza artesanal", 24);
  linkProducto(nocheVinilo.id, "Brownie", 10);
  for (const nombre of ["Valentina Henao", "Tomás Giraldo", "Mateo Ríos", "Elena Vargas", "Mariana López", "Pablo Mejía", "Renata Gil", "Samuel Quintero"]) {
    linkParticipante(nocheVinilo.id, nombre);
  }

  linkEmpleado(clubLectura.id, "Sara Vélez");
  linkEmpleado(clubLectura.id, "Helena Marín");
  linkEquipo(clubLectura.id, "Proyector");
  linkProducto(clubLectura.id, "Americano", 6);
  for (const nombre of ["Valentina Henao", "Lucía Cárdenas", "Felipe Castro", "Renata Gil"]) {
    linkParticipante(clubLectura.id, nombre);
  }

  // --- Costos, permisos y turnos -------------------------------------------
  const periodo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const finMes = dateISO(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  const costos: Array<[string, string, number, string, "pendiente" | "pagado"]> = [
    ["Arriendo local Laureles", "arriendo", 8_500_000, finMes, "pendiente"],
    ["Energía", "servicios", 920_000, dateISO(addDays(now, 6)), "pagado"],
    ["Acueducto", "servicios", 310_000, dateISO(addDays(now, 8)), "pagado"],
    ["Gas", "servicios", 180_000, dateISO(addDays(now, 8)), "pendiente"],
    ["Internet", "servicios", 250_000, dateISO(addDays(now, 4)), "pagado"],
    ["Aseo y residuos", "servicios", 400_000, finMes, "pendiente"],
    ["Derechos de música", "obligaciones", 150_000, dateISO(addDays(now, 12)), "pendiente"],
  ];
  for (const [concepto, categoria, monto, vencimiento, estado] of costos) {
    await prisma.costo.create({
      data: {
        concepto,
        categoria,
        monto,
        periodo,
        vencimiento: dayStamp(new Date(`${vencimiento}T00:00:00`), "00:00"),
        estado,
      },
    });
  }

  const permisos: Array<[string, string, string, string]> = [
    ["Uso de suelos", "Alcaldía de Medellín", "US-44120", dateISO(addDays(now, 400))],
    ["Concepto sanitario", "Secretaría de Salud", "CS-22811", dateISO(addDays(now, 220))],
    ["Concepto de bomberos", "DAGRD", "CB-10992", dateISO(addDays(now, 300))],
    ["Derechos de ejecución musical", "Sayco / Acinpro", "MU-7731", dateISO(addDays(now, 140))],
    ["Venta de bebidas alcohólicas", "Alcaldía de Medellín", "BA-1904", dateISO(addDays(now, 18))],
  ];
  for (const [nombre, entidad, numero, vencimiento] of permisos) {
    await prisma.permiso.create({
      data: {
        nombre,
        entidad,
        numero,
        vencimiento: dayStamp(new Date(`${vencimiento}T00:00:00`), "00:00"),
        estado: "vigente",
      },
    });
  }

  const turnos: Array<[string, string, string, string]> = [
    ["Helena Marín", "08:00", "17:00", "Dirección"],
    ["Camila Restrepo", "14:00", "22:00", "Café"],
    ["Julián Ortiz", "08:00", "16:00", "Cocina"],
    ["Sara Vélez", "12:00", "22:00", "Sala"],
    ["Andrés Cano", "07:00", "15:00", "Aseo"],
  ];
  for (const offset of [0, 1]) {
    // Los turnos se guardan en UTC a medianoche (ver lib/fechas.ts): así el
    // día es el mismo sin importar la zona horaria del proceso.
    const fecha = new Date(
      Date.UTC(
        addDays(now, offset).getFullYear(),
        addDays(now, offset).getMonth(),
        addDays(now, offset).getDate(),
      ),
    );
    for (const [nombre, horaInicio, horaFin, area] of turnos) {
      const id = ctx.empleadoPorNombre.get(nombre);
      if (id === undefined) throw new Error(`Empleado inexistente: ${nombre}`);
      await prisma.turno.create({
        data: { empleadoId: id, fecha, horaInicio, horaFin, area },
      });
    }
  }

  console.log("✔ Equipos, experiencias, costos, permisos y turnos registrados");
  await verificarInvariantes();
}

/**
 * Comprueba las mismas invariantes que el seeder antiguo lanzaba como error:
 * sin reservas cruzadas y sin stock negativo.
 */
async function verificarInvariantes(): Promise<void> {
  const cruces = await prisma.reserva.findMany({
    where: {
      estado: { not: "cancelada" },
      espacio: { reservas: { some: { estado: { not: "cancelada" } } } },
    },
    select: { id: true, espacioId: true, inicio: true, fin: true },
  });

  const porEspacio = new Map<number, Array<{ id: number; inicio: Date; fin: Date }>>();
  for (const r of cruces) {
    const list = porEspacio.get(r.espacioId) ?? [];
    list.push({ id: r.id, inicio: r.inicio, fin: r.fin });
    porEspacio.set(r.espacioId, list);
  }
  const solapadas: string[] = [];
  for (const [espacioId, lista] of porEspacio) {
    for (let i = 0; i < lista.length; i += 1) {
      for (let j = i + 1; j < lista.length; j += 1) {
        const a = lista[i]!;
        const b = lista[j]!;
        if (a.inicio < b.fin && a.fin > b.inicio) {
          solapadas.push(`espacio ${espacioId}: reservas ${a.id} y ${b.id}`);
        }
      }
    }
  }
  if (solapadas.length > 0) {
    throw new Error(`El escenario inicial dejó reservas cruzadas:\n${solapadas.join("\n")}`);
  }

  const negativos = await prisma.insumo.findMany({
    where: { stock: { lt: 0 } },
    select: { nombre: true, stock: true },
  });
  if (negativos.length > 0) {
    throw new Error(`Stock negativo tras la semilla: ${JSON.stringify(negativos)}`);
  }

  console.log("✔ Invariantes verificados: sin reservas cruzadas ni stock negativo");
}

main()
  .catch((error: unknown) => {
    console.error("✖ Falló la semilla:", error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });