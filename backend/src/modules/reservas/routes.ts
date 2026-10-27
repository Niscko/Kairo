import { Router } from "express";
import { z } from "zod";

import { clienteIdDeUsuario } from "../../lib/clientes.js";
import { ValidationError } from "../../lib/errors.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import {
  cancelarReservaSchema,
  crearReservaSchema,
  listarReservasQuerySchema,
} from "./schema.js";
import { cancelar, crear, listar } from "./service.js";

const idParamSchema = z.coerce.number().int().positive();

export function reservasRouter(): Router {
  const router = Router();

  router.use(requireAuth);

  // GET /api/reservas
  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const query = listarReservasQuerySchema.parse(req.query);
      // El personal ve todas las reservas; un cliente solo las suyas.
      const clienteId =
        req.auth?.rol === "cliente" ? await clienteIdDeUsuario(req.auth.userId) : null;
      res.status(200).json(await listar(query, clienteId));
    }),
  );

  // POST /api/reservas
  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const input = crearReservaSchema.parse(req.body);
      const clienteId =
        req.auth?.rol === "cliente" ? await clienteIdDeUsuario(req.auth.userId) : null;
      res.status(201).json(await crear(input, clienteId));
    }),
  );

  // PATCH /api/reservas/:id — solo admite la cancelación.
  router.patch(
    "/:id",
    asyncHandler(async (req, res) => {
      const id = parseId(req.params.id);
      cancelarReservaSchema.parse(req.body);
      const clienteId =
        req.auth?.rol === "cliente" ? await clienteIdDeUsuario(req.auth.userId) : null;
      await cancelar(id, clienteId);
      res.status(200).json({ ok: true });
    }),
  );

  return router;
}

function parseId(raw: string | undefined): number {
  const parsed = idParamSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError("El identificador de la reserva debe ser un número positivo");
  }
  return parsed.data;
}

export { requireRole };
