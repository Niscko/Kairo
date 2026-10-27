import { Router } from "express";
import { z } from "zod";

import { clienteIdDeUsuario } from "../../lib/clientes.js";
import { ValidationError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import { crearVentaSchema, listarVentasQuerySchema } from "./schema.js";
import { crearVenta, listarVentas } from "./service.js";

export function ventasRouter(): Router {
  const router = Router();

  router.use(requireAuth);

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
      const esCliente = req.auth?.rol === "cliente";
      const clienteIdPropio = esCliente ? await clienteIdDeUsuario(req.auth!.userId) : null;

      // Si el usuario es cliente pero no tiene perfil de cliente, no puede vender.
      if (esCliente && clienteIdPropio === null) {
        throw new ValidationError("La cuenta no tiene un perfil de cliente");
      }

      // El personal registra la venta a su nombre; el cliente, sin empleado.
      const empleadoId = esCliente
        ? null
        : await empleadoIdDeUsuario(req.auth!.userId);

      res.status(201).json(await crearVenta(input, { clienteIdPropio, empleadoId }));
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

export { z };
