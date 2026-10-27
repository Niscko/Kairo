import { ConflictError, NotFoundError, ValidationError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { toDateOnly } from "../clientes/service.js";
import type {
  ActualizarProductoInput,
  CrearInsumoInput,
  CrearMovimientoInput,
  CrearProductoInput,
  CrearProveedorInput,
} from "./schema.js";

// --- Productos --------------------------------------------------------------

export async function listarProductos(query: {
  q?: string;
  categoria?: string;
  soloActivos: boolean;
}) {
  const productos = await prisma.producto.findMany({
    where: {
      ...(query.categoria ? { categoria: query.categoria as never } : {}),
      ...(query.soloActivos ? { activo: true } : {}),
      ...(query.q ? { nombre: { contains: query.q, mode: "insensitive" } } : {}),
    },
    include: {
      recetaItems: { include: { insumo: { select: { nombre: true, unidad: true } } } },
    },
    orderBy: [{ categoria: "asc" }, { nombre: "asc" }],
  });

  return productos.map((producto) => ({
    id: producto.id,
    nombre: producto.nombre,
    categoria: producto.categoria,
    precio: producto.precio,
    descripcion: producto.descripcion,
    esAlcohol: producto.esAlcohol,
    activo: producto.activo,
    receta: producto.recetaItems.map((item) => ({
      insumoId: item.insumoId,
      insumo: item.insumo.nombre,
      unidad: item.insumo.unidad,
      cantidad: item.cantidad,
    })),
  }));
}

export async function crearProducto(input: CrearProductoInput) {
  const existente = await prisma.producto.findUnique({
    where: { nombre: input.nombre },
    select: { id: true },
  });
  if (existente) {
    throw new ConflictError(`Ya existe un producto llamado "${input.nombre}"`);
  }
  return prisma.producto.create({
    data: {
      nombre: input.nombre,
      categoria: input.categoria,
      precio: input.precio,
      descripcion: input.descripcion ?? null,
      esAlcohol: input.esAlcohol,
    },
    select: { id: true, nombre: true, precio: true },
  });
}

export async function actualizarProducto(id: number, input: ActualizarProductoInput) {
  const producto = await prisma.producto.findUnique({ where: { id }, select: { id: true } });
  if (!producto) {
    throw new NotFoundError("Producto");
  }
  if (input.nombre) {
    const duplicado = await prisma.producto.findFirst({
      where: { nombre: { equals: input.nombre, mode: "insensitive" }, NOT: { id } },
      select: { id: true },
    });
    if (duplicado) {
      throw new ConflictError(`Ya existe otro producto llamado "${input.nombre}"`);
    }
  }
  return prisma.producto.update({
    where: { id },
    data: {
      ...(input.nombre !== undefined ? { nombre: input.nombre } : {}),
      ...(input.categoria !== undefined ? { categoria: input.categoria } : {}),
      ...(input.precio !== undefined ? { precio: input.precio } : {}),
      ...(input.descripcion !== undefined ? { descripcion: input.descripcion ?? null } : {}),
      ...(input.esAlcohol !== undefined ? { esAlcohol: input.esAlcohol } : {}),
      ...(input.activo !== undefined ? { activo: input.activo } : {}),
    },
    select: { id: true, nombre: true, precio: true, activo: true },
  });
}

// --- Insumos ---------------------------------------------------------------

export async function listarInsumos(query: { q?: string; bajoMinimo: boolean }) {
  const insumos = await prisma.insumo.findMany({
    where: {
      ...(query.q ? { nombre: { contains: query.q, mode: "insensitive" } } : {}),
      ...(query.bajoMinimo ? { stock: { lte: prisma.insumo.fields.stockMinimo } } : {}),
    },
    include: { proveedor: { select: { nombre: true } } },
    orderBy: { nombre: "asc" },
  });

  return insumos.map((insumo) => ({
    id: insumo.id,
    nombre: insumo.nombre,
    unidad: insumo.unidad,
    stock: insumo.stock,
    stockMinimo: insumo.stockMinimo,
    costoUnitario: insumo.costoUnitario,
    proveedor: insumo.proveedor?.nombre ?? null,
    // Un insumo por debajo del mínimo necesita reposición.
    bajoMinimo: insumo.stock <= insumo.stockMinimo,
  }));
}

export async function crearInsumo(input: CrearInsumoInput) {
  const existente = await prisma.insumo.findUnique({
    where: { nombre: input.nombre },
    select: { id: true },
  });
  if (existente) {
    throw new ConflictError(`Ya existe un insumo llamado "${input.nombre}"`);
  }
  return prisma.insumo.create({
    data: {
      nombre: input.nombre,
      unidad: input.unidad,
      stock: input.stock,
      stockMinimo: input.stockMinimo,
      costoUnitario: input.costoUnitario,
      proveedorId: input.proveedorId ?? null,
    },
    select: { id: true, nombre: true },
  });
}

// --- Movimientos de inventario ---------------------------------------------

/**
 * Registra un movimiento de inventario y ajusta el stock en la misma
 * transacción. Una salida o merma nunca puede dejar el stock en negativo:
 * eso significaría vender o consumir algo que no existe.
 */
export async function crearMovimiento(input: CrearMovimientoInput) {
  const insumo = await prisma.insumo.findUnique({
    where: { id: input.insumoId },
    select: { id: true, nombre: true, stock: true },
  });
  if (!insumo) {
    throw new NotFoundError("Insumo");
  }

  if (input.tipo !== "entrada" && insumo.stock < input.cantidad) {
    throw new ConflictError(
      `Stock insuficiente de "${insumo.nombre}": hay ${insumo.stock} y se piden ${input.cantidad}`,
    );
  }

  const movimiento = await prisma.$transaction(async (tx) => {
    const nuevo = await tx.movimientoInventario.create({
      data: {
        insumoId: input.insumoId,
        tipo: input.tipo,
        cantidad: input.cantidad,
        motivo: input.motivo ?? null,
        referencia: input.referencia ?? null,
        fecha: new Date(),
      },
      select: { id: true, fecha: true },
    });

    await tx.insumo.update({
      where: { id: input.insumoId },
      data:
        input.tipo === "entrada"
          ? { stock: { increment: input.cantidad } }
          : { stock: { decrement: input.cantidad } },
    });

    return nuevo;
  });

  return { id: movimiento.id, fecha: movimiento.fecha.toISOString() };
}

export async function listarMovimientos(query: {
  insumoId?: number;
  tipo?: string;
  desde?: string;
  hasta?: string;
  limite: number;
}) {
  const desde = query.desde ? new Date(`${query.desde}T00:00:00`) : undefined;
  const hasta = query.hasta ? new Date(`${query.hasta}T00:00:00`) : undefined;

  const movimientos = await prisma.movimientoInventario.findMany({
    where: {
      ...(query.insumoId ? { insumoId: query.insumoId } : {}),
      ...(query.tipo ? { tipo: query.tipo as never } : {}),
      ...(desde || hasta
        ? {
            fecha: {
              ...(desde ? { gte: desde } : {}),
              ...(hasta ? { lt: hasta } : {}),
            },
          }
        : {}),
    },
    include: { insumo: { select: { nombre: true, unidad: true } } },
    orderBy: { fecha: "desc" },
    take: query.limite,
  });

  return movimientos.map((movimiento) => ({
    id: movimiento.id,
    insumoId: movimiento.insumoId,
    insumo: movimiento.insumo.nombre,
    unidad: movimiento.insumo.unidad,
    tipo: movimiento.tipo,
    cantidad: movimiento.cantidad,
    motivo: movimiento.motivo,
    referencia: movimiento.referencia,
    fecha: toDateOnly(movimiento.fecha),
  }));
}

// --- Proveedores ------------------------------------------------------------

export async function listarProveedores(query: { q?: string }) {
  const proveedores = await prisma.proveedor.findMany({
    where: query.q ? { nombre: { contains: query.q, mode: "insensitive" } } : {},
    include: { _count: { select: { insumos: true } } },
    orderBy: { nombre: "asc" },
  });
  return proveedores.map((proveedor) => ({
    id: proveedor.id,
    nombre: proveedor.nombre,
    contacto: proveedor.contacto,
    telefono: proveedor.telefono,
    categoria: proveedor.categoria,
    insumos: proveedor._count.insumos,
  }));
}

export async function crearProveedor(input: CrearProveedorInput) {
  const existente = await prisma.proveedor.findFirst({
    where: { nombre: { equals: input.nombre, mode: "insensitive" } },
    select: { id: true },
  });
  if (existente) {
    throw new ConflictError(`Ya existe un proveedor llamado "${input.nombre}"`);
  }
  return prisma.proveedor.create({
    data: {
      nombre: input.nombre,
      contacto: input.contacto ?? null,
      telefono: input.telefono ?? null,
      categoria: input.categoria,
    },
    select: { id: true, nombre: true },
  });
}

export { ValidationError };
