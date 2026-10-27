import { type Router } from "express";

import { identidadDeUsuario } from "../../lib/clientes.js";
import { prisma } from "../../lib/prisma.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import { crearPedidoSchema } from "./schema.js";
import { crearPedido, disponibilidad } from "./service.js";
import { routerConAuth } from "../../middleware/router.js";

export function pedidosRouter(): Router {
  const router = routerConAuth();

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
      const identidad = await identidadDeUsuario(req.auth!.userId, req.auth!.rol);
      const esCliente = identidad.rol === "cliente";

      const empleadoId = esCliente ? null : identidad.empleadoId;

      res
        .status(201)
        .json(await crearPedido(input, { clienteId: identidad.clienteId, empleadoId }));
    }),
  );

  return router;
}
