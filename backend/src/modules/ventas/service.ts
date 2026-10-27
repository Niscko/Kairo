import { ConflictError, NotFoundError, ValidationError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { toDateOnly } from "../clientes/service.js";
import type { CrearVentaInput, ListarVentasQuery } from "./schema.js";

export interface VentaDTO {
  id: number;
  cliente: string | null;
  empleado: string | null;
  fecha: string;
  metodoPago: string;
  total: number;
  items: Array<{ producto: string; cantidad: number; precio: number }>;
}

export async function listarVentas(query: ListarVentasQuery): Promise<VentaDTO[]> {
  const desde = query.desde ? new Date(`${query.desde}T00:00:00`) : undefined;
  const hasta = query.hasta ? new Date(`${query.hasta}T00:00:00`) : undefined;

  const ventas = await prisma.venta.findMany({
    where: {
      ...(desde || hasta
        ? { fecha: { ...(desde ? { gte: desde } : {}), ...(hasta ? { lt: hasta } : {}) } }
        : {}),
    },
    include: {
      cliente: { include: { usuario: { select: { nombre: true } } } },
      empleado: { include: { usuario: { select: { nombre: true } } } },
      items: { include: { producto: { select: { nombre: true } } } },
    },
    orderBy: [{ fecha: "desc" }, { id: "desc" }],
    take: query.limite,
  });

  return ventas.map((venta) => ({
    id: venta.id,
    cliente: venta.cliente?.usuario.nombre ?? null,
    empleado: venta.empleado?.usuario.nombre ?? null,
    fecha: toDateOnly(venta.fecha),
    metodoPago: venta.metodoPago,
    total: venta.total,
    items: venta.items.map((item) => ({
      producto: item.producto.nombre,
      cantidad: item.cantidad,
      precio: item.precio,
    })),
  }));
}

/**
 * Registra una venta y descuenta el inventario según las recetas de cada
 * producto. Todo ocurre en una transacción: o se guarda la venta y se ajusta
 * el stock, o no se toca nada.
 */
export async function crearVenta(
  input: CrearVentaInput,
  opciones: { clienteIdPropio: number | null; empleadoId: number | null },
): Promise<{ id: number; total: number }> {
  const clienteId = opciones.clienteIdPropio ?? input.clienteId ?? null;

  if (clienteId) {
    const cliente = await prisma.cliente.findFirst({
      where: { id: clienteId, usuario: { activo: true } },
      select: { id: true },
    });
    if (!cliente) {
      throw new NotFoundError("Cliente");
    }
  }

  // Se validan los productos antes de abrir la transacción.
  const productoIds = [...new Set(input.items.map((item) => item.productoId))];
  const productos = await prisma.producto.findMany({
    where: { id: { in: productoIds }, activo: true },
    include: { recetaItems: true },
  });

  const porId = new Map(productos.map((producto) => [producto.id, producto]));
  const lineas: Array<{ productoId: number; cantidad: number; precio: number }> = [];
  let total = 0;
  let incluyeAlcohol = false;

  for (const item of input.items) {
    const producto = porId.get(item.productoId);
    if (!producto) {
      throw new ConflictError("Hay un producto que ya no está disponible");
    }
    lineas.push({ productoId: producto.id, cantidad: item.cantidad, precio: producto.precio });
    total += producto.precio * item.cantidad;
    if (producto.esAlcohol) incluyeAlcohol = true;
  }

  if (incluyeAlcohol && !input.mayorEdad) {
    throw new ValidationError(
      "La venta incluye alcohol. Confirma que el cliente es mayor de 18 años.",
    );
  }

  return prisma.$transaction(async (tx) => {
    const venta = await tx.venta.create({
      data: {
        // Una venta puede no tener cliente (consumo en mostrador) ni empleado
        // (la registra el propio cliente).
        clienteId: clienteId ?? null,
        empleadoId: opciones.empleadoId ?? null,
        fecha: new Date(),
        metodoPago: input.metodoPago,
        total,
      },
      select: { id: true },
    });

    for (const linea of lineas) {
      await tx.ventaItem.create({
        data: {
          ventaId: venta.id,
          productoId: linea.productoId,
          cantidad: linea.cantidad,
          precio: linea.precio,
        },
      });

      // Se descuenta el stock de cada insumo de la receta.
      const producto = porId.get(linea.productoId);
      for (const receta of producto?.recetaItems ?? []) {
        const cantidad = receta.cantidad * linea.cantidad;

        const stockActual = await tx.insumo.findUnique({
          where: { id: receta.insumoId },
          select: { stock: true, nombre: true },
        });
        if (!stockActual) {
          throw new ConflictError(`El insumo ${receta.insumoId} ya no existe`);
        }
        if (stockActual.stock < cantidad) {
          throw new ConflictError(
            `Stock insuficiente de "${stockActual.nombre}": hay ${stockActual.stock} y se necesitan ${cantidad}`,
          );
        }

        await tx.insumo.update({
          where: { id: receta.insumoId },
          data: { stock: { decrement: cantidad } },
        });
        await tx.movimientoInventario.create({
          data: {
            insumoId: receta.insumoId,
            tipo: "salida",
            cantidad,
            motivo: "Venta de mostrador",
            fecha: new Date(),
            referencia: `Venta ${venta.id}`,
          },
        });
      }
    }

    return { id: venta.id, total };
  });
}
