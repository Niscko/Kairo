import { z } from "zod";

import { MetodoPago } from "@prisma/client";

/** Máximo de unidades de un mismo producto en un pedido. */
export const MAX_CANTIDAD_ITEM = 40;

export const itemPedidoSchema = z.object({
  productoId: z.coerce.number().int().positive(),
  cantidad: z.coerce
    .number()
    .int()
    .min(1, "Hay un producto con cantidad no válida")
    .max(MAX_CANTIDAD_ITEM, "Hay un producto con cantidad no válida"),
});

export const crearPedidoSchema = z.object({
  metodoPago: z.nativeEnum(MetodoPago, {
    errorMap: () => ({ message: "Selecciona el medio de pago" }),
  }),
  items: z
    .array(itemPedidoSchema)
    .min(1, "El pedido está vacío")
    .max(30, "El pedido es demasiado grande"),
  /** Confirmación de mayoría de edad cuando el pedido incluye alcohol. */
  mayorEdad: z.boolean().default(false),
});

export type CrearPedidoInput = z.infer<typeof crearPedidoSchema>;
