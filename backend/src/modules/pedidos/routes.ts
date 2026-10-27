import { Router } from "express";

import { clienteIdDeUsuario } from "../../lib/clientes.js";
import { ValidationError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { requireAuth } from "../../middleware/auth.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import { crearPedidoSchema } from "./schema.js";
import { crearPedido, disponibilidad } from "./service.js";

export function pedidosRouter(): Router {
  const router = Router();

  router.use(requireAuth);

  // GET /api/pedidos/disponibilidad — cuántas unidades quedan de cada producto.
  router.get(
    "/disponibilidad",
    asyncHandler(async (req, res) => {
      const productos = await prisma.producto.findMany({
        where: { activo: true },
        select: { id: true },
      });
      const limites = await disponibilidad(productos.map((producto) => producto.id));

      const resultado: Record<string, number> = {};
      for (const producto of productos) {
        const limite = limites.get(producto.id) ?? 0;
        // El infinito no es un número válido en JSON: se acota a un tope alto.
        resultado[String(producto.id)] = Number.isFinite(limite) ? limite : 999;
      }
      res.status(200).json({ disponibilidad: resultado });
    }),
  );

  // POST /api/pedidos — registra el pedido como venta.
  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const input = crearPedidoSchema.parse(req.body);
      const esCliente = req.auth?.rol === "cliente";
      const clienteId = esCliente ? await clienteIdDeUsuario(req.auth!.userId) : null;

      if (esCliente && clienteId === null) {
        throw new ValidationError("La cuenta no tiene un perfil de cliente");
      }

      const empleadoId = esCliente ? null : await empleadoIdDeUsuario(req.auth!.userId);

      res.status(201).json(await crearPedido(input, { clienteId, empleadoId }));
    }),
  );

  return router;
}

/** Id de empleado del usuario, o null si no es personal del local. */
async function empleadoIdDeUsuario(usuarioId: number): Promise<number | null> {
  const empleado = await prisma.empleado.findUnique({
    where: { usuarioId },
    select: { id: true },
  });
  return empleado?.id ?? null;
}
