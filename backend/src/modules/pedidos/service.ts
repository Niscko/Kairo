import { ConflictError, ValidationError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import type { CrearPedidoInput } from "./schema.js";

export interface PedidoDTO {
  id: number;
  total: number;
  /** Venta a la que corresponde el pedido, para poder consultarla. */
  ventaId: number;
}

/**
 * Convierte un pedido en una venta.
 *
 * Es el mismo camino que usa el personal en el punto de venta: se valida el
 * catálogo, se comprueba la edad si hay alcohol y se descuenta el inventario
 * según las recetas, todo dentro de una transacción.
 */
export async function crearPedido(
  input: CrearPedidoInput,
  opciones: { clienteId: number | null; empleadoId: number | null },
): Promise<PedidoDTO> {
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
        ...(opciones.clienteId ? { cliente: { connect: { id: opciones.clienteId } } } : {}),
        ...(opciones.empleadoId ? { empleado: { connect: { id: opciones.empleadoId } } } : {}),
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

      const producto = porId.get(linea.productoId);
      for (const receta of producto?.recetaItems ?? []) {
        const cantidad = receta.cantidad * linea.cantidad;

        const insumo = await tx.insumo.findUnique({
          where: { id: receta.insumoId },
          select: { stock: true, nombre: true },
        });
        if (!insumo) {
          throw new ConflictError(`El insumo ${receta.insumoId} ya no existe`);
        }
        if (insumo.stock < cantidad) {
          throw new ConflictError(
            `Stock insuficiente de "${insumo.nombre}": hay ${insumo.stock} y se necesitan ${cantidad}`,
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

    return { id: venta.id, total, ventaId: venta.id };
  });
}

/**
 * Cuántas unidades de cada producto se pueden preparar con el stock actual.
 *
 * El límite lo marca el insumo que se agota antes: si un café usa 18 g de café
 * y 1 vaso, y hay 100 g de café pero 3 vasos, se pueden hacer 3 cafés, no 5.
 *
 * Un producto sin receta (un servicio, por ejemplo) no consume stock: se
 * considera siempre disponible.
 */
export async function disponibilidad(
  productoIds: number[],
): Promise<Map<number, number>> {
  if (productoIds.length === 0) return new Map();

  const recetas = await prisma.recetaItem.findMany({
    where: { productoId: { in: productoIds } },
    include: { insumo: { select: { stock: true } } },
  });

  // Para cada insumo, cuánto se consume por unidad de producto.
  const porProducto = new Map<number, Map<number, number>>();
  for (const receta of recetas) {
    const insumos = porProducto.get(receta.productoId) ?? new Map<number, number>();
    insumos.set(receta.insumoId, receta.cantidad);
    porProducto.set(receta.productoId, insumos);
  }

  const stockPorInsumo = new Map<number, number>();
  for (const receta of recetas) {
    if (!stockPorInsumo.has(receta.insumoId)) {
      const insumo = await prisma.insumo.findUnique({
        where: { id: receta.insumoId },
        select: { stock: true },
      });
      stockPorInsumo.set(receta.insumoId, insumo?.stock ?? 0);
    }
  }

  const resultado = new Map<number, number>();
  for (const productoId of productoIds) {
    const insumos = porProducto.get(productoId);
    if (!insumos || insumos.size === 0) {
      resultado.set(productoId, Number.POSITIVE_INFINITY);
      continue;
    }
    let maximo = Number.POSITIVE_INFINITY;
    for (const [insumoId, cantidadPorUnidad] of insumos) {
      const stock = stockPorInsumo.get(insumoId) ?? 0;
      if (cantidadPorUnidad <= 0) continue;
      maximo = Math.min(maximo, Math.floor(stock / cantidadPorUnidad));
    }
    resultado.set(productoId, maximo);
  }
  return resultado;
}
