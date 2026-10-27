import { type Router } from "express";
import { z } from "zod";

import { identidadDeUsuario } from "../../lib/clientes.js";
import { requireRole } from "../../middleware/auth.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import { crearVentaSchema, listarVentasQuerySchema } from "./schema.js";
import { crearVenta, listarVentas } from "./service.js";
import { routerConAuth } from "../../middleware/router.js";

export function ventasRouter(): Router {
  const router = routerConAuth();

  // GET /api/ventas — el personal revisa la caja; un cliente no ve la de otros.
  router.get(
    "/",
    requireRole("admin", "empleado"),
    asyncHandler(async (req, res) => {
      const query = listarVentasQuerySchema.parse(req.query);
      res.status(200).json({ ventas: await listarVentas(query) });
    }),
  );

  // POST /api/ventas
  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const input = crearVentaSchema.parse(req.body);
      const identidad = await identidadDeUsuario(req.auth!.userId, req.auth!.rol);
      const esCliente = identidad.rol === "cliente";

      // El personal registra la venta a su nombre; el cliente, sin empleado.
      const empleadoId = esCliente ? null : identidad.empleadoId;

      res
        .status(201)
        .json(await crearVenta(input, { clienteIdPropio: identidad.clienteId, empleadoId }));
    }),
  );

  return router;
}

export { z };
