import { Router } from "express";
import { z } from "zod";

import { aCsv, nombreArchivo } from "../../lib/csv.js";
import { dateISO } from "../../lib/domain.js";
import { prisma } from "../../lib/prisma.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import { resolverPeriodo } from "../../lib/periodos.js";
import { formatDateTimeLocal } from "../reservas/schema.js";

const querySchema = z.object({
  rango: z.enum(["hoy", "7d", "21d", "mes", "custom"]).default("mes"),
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/**
 * Exportaciones a CSV.
 *
 * El separador es punto y coma y el archivo lleva BOM: así se abre bien en
 * Excel en español, con acentos correctos y las cifras con el separador
 * decimal que espera el idioma.
 */
export function exportacionesRouter(): Router {
  const router = Router();

  router.use(requireAuth);

  // GET /api/exportaciones/ventas.csv
  router.get(
    "/ventas.csv",
    requireRole("admin", "empleado"),
    asyncHandler(async (req, res) => {
      const query = querySchema.parse(req.query);
      const periodo = resolverPeriodo({
        rango: query.rango,
        desde: query.desde,
        hasta: query.hasta,
      });
      const inicio = new Date(periodo.start.replace(" ", "T"));
      const fin = new Date(periodo.end.replace(" ", "T"));

      const ventas = await prisma.venta.findMany({
        where: { fecha: { gte: inicio, lt: fin } },
        include: {
          cliente: { include: { usuario: { select: { nombre: true } } } },
          empleado: { include: { usuario: { select: { nombre: true } } } },
          items: { include: { producto: { select: { nombre: true } } } },
        },
        orderBy: { fecha: "asc" },
      });

      const filas: Array<Array<unknown>> = [];
      for (const venta of ventas) {
        for (const item of venta.items) {
          filas.push([
            dateISO(venta.fecha),
            formatDateTimeLocal(venta.fecha).slice(11, 16),
            venta.id,
            venta.cliente?.usuario.nombre ?? "",
            venta.empleado?.usuario.nombre ?? "",
            item.producto.nombre,
            item.cantidad,
            item.precio,
            item.cantidad * item.precio,
            venta.metodoPago,
            venta.total,
          ]);
        }
      }

      const csv = aCsv(
        [
          "Fecha",
          "Hora",
          "Venta",
          "Cliente",
          "Atendió",
          "Producto",
          "Cantidad",
          "Precio",
          "Subtotal",
          "Método de pago",
          "Total venta",
        ],
        filas,
      );

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${nombreArchivo("ventas")}"`,
      );
      res.send(csv);
    }),
  );

  // GET /api/exportaciones/reservas.csv
  router.get(
    "/reservas.csv",
    requireRole("admin", "empleado"),
    asyncHandler(async (req, res) => {
      const query = querySchema.parse(req.query);
      const periodo = resolverPeriodo({
        rango: query.rango,
        desde: query.desde,
        hasta: query.hasta,
      });
      const inicio = new Date(periodo.start.replace(" ", "T"));
      const fin = new Date(periodo.end.replace(" ", "T"));

      const reservas = await prisma.reserva.findMany({
        where: { inicio: { gte: inicio, lt: fin } },
        include: {
          espacio: { select: { nombre: true, tipo: true } },
          cliente: { include: { usuario: { select: { nombre: true } } } },
        },
        orderBy: { inicio: "asc" },
      });

      const csv = aCsv(
        ["Reserva", "Espacio", "Tipo", "Cliente", "Inicio", "Fin", "Propósito", "Estado", "Monto", "Notas"],
        reservas.map((reserva) => [
          reserva.id,
          reserva.espacio.nombre,
          reserva.espacio.tipo,
          reserva.cliente?.usuario.nombre ?? "",
          formatDateTimeLocal(reserva.inicio),
          formatDateTimeLocal(reserva.fin),
          reserva.proposito,
          reserva.estado,
          reserva.monto,
          reserva.notas ?? "",
        ]),
      );

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${nombreArchivo("reservas")}"`,
      );
      res.send(csv);
    }),
  );

  // GET /api/exportaciones/inventario.csv
  router.get(
    "/inventario.csv",
    requireRole("admin", "empleado"),
    asyncHandler(async (req, res) => {
      const insumos = await prisma.insumo.findMany({
        include: { proveedor: { select: { nombre: true } } },
        orderBy: { nombre: "asc" },
      });

      const csv = aCsv(
        ["Insumo", "Unidad", "Existencia", "Mínimo", "Costo unitario", "Proveedor", "Bajo mínimo"],
        insumos.map((insumo) => [
          insumo.nombre,
          insumo.unidad,
          insumo.stock,
          insumo.stockMinimo,
          insumo.costoUnitario,
          insumo.proveedor?.nombre ?? "",
          insumo.stock <= insumo.stockMinimo ? "Sí" : "No",
        ]),
      );

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${nombreArchivo("inventario")}"`,
      );
      res.send(csv);
    }),
  );

  // GET /api/exportaciones/reportes.csv — el detalle diario del reporte.
  router.get(
    "/reportes.csv",
    requireRole("admin"),
    asyncHandler(async (req, res) => {
      const query = querySchema.parse(req.query);
      const periodo = resolverPeriodo({
        rango: query.rango,
        desde: query.desde,
        hasta: query.hasta,
      });
      const inicio = new Date(periodo.start.replace(" ", "T"));
      const fin = new Date(periodo.end.replace(" ", "T"));

      const ventas = await prisma.venta.findMany({
        where: { fecha: { gte: inicio, lt: fin } },
        select: { fecha: true, total: true },
      });

      const porDia = new Map<string, number>();
      for (const venta of ventas) {
        const dia = dateISO(venta.fecha);
        porDia.set(dia, (porDia.get(dia) ?? 0) + venta.total);
      }

      const dias: string[] = [];
      let cursor = new Date(inicio);
      while (cursor < fin) {
        dias.push(dateISO(cursor));
        cursor = new Date(cursor.getTime() + 86_400_000);
      }

      const csv = aCsv(
        ["Día", "Ventas"],
        dias.map((dia) => [dia, porDia.get(dia) ?? 0]),
      );

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${nombreArchivo("reportes")}"`,
      );
      res.send(csv);
    }),
  );

  return router;
}
