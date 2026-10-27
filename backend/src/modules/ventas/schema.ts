import { z } from "zod";

import { MetodoPago } from "@prisma/client";

export const MAX_ITEMS_POR_VENTA = 30;
export const MAX_CANTIDAD_POR_ITEM = 40;

export const itemVentaSchema = z.object({
  productoId: z.coerce.number().int().positive(),
  cantidad: z.coerce
    .number()
    .int()
    .min(1, "Hay un producto con cantidad no válida")
    .max(MAX_CANTIDAD_POR_ITEM, "Hay un producto con cantidad no válida"),
});

export const crearVentaSchema = z.object({
  metodoPago: z.nativeEnum(MetodoPago, {
    errorMap: () => ({ message: "Selecciona el medio de pago" }),
  }),
  clienteId: z.coerce.number().int().positive().optional(),
  items: z
    .array(itemVentaSchema)
    .min(1, "El pedido está vacío")
    .max(MAX_ITEMS_POR_VENTA, "El pedido es demasiado grande"),
  /** Confirmación de mayoría de edad cuando el pedido incluye alcohol. */
  mayorEdad: z.boolean().default(false),
});

export const listarVentasQuerySchema = z.object({
  limite: z.coerce.number().int().min(1).max(200).default(12),
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Usa el formato AAAA-MM-DD").optional(),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Usa el formato AAAA-MM-DD").optional(),
});

export type CrearVentaInput = z.infer<typeof crearVentaSchema>;
export type ListarVentasQuery = z.infer<typeof listarVentasQuerySchema>;
