import { Router } from "express";
import { z } from "zod";

import { ValidationError } from "../../lib/errors.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import {
  actualizarClienteSchema,
  listarClientesQuerySchema,
} from "./schema.js";
import { actualizar, listar, obtener } from "./service.js";

const idParamSchema = z.coerce.number().int().positive();

export function clientesRouter(): Router {
  const router = Router();

  router.use(requireAuth);

  // GET /api/clientes — el personal del local consulta la base de clientes.
  router.get(
    "/",
    requireRole("admin", "empleado"),
    asyncHandler(async (req, res) => {
      const query = listarClientesQuerySchema.parse(req.query);
      res.status(200).json({ clientes: await listar(query) });
    }),
  );

  // GET /api/clientes/:id
  router.get(
    "/:id",
    requireRole("admin", "empleado"),
    asyncHandler(async (req, res) => {
      const id = parseId(req.params.id);
      res.status(200).json(await obtener(id));
    }),
  );

  // PATCH /api/clientes/:id
  router.patch(
    "/:id",
    requireRole("admin", "empleado"),
    asyncHandler(async (req, res) => {
      const id = parseId(req.params.id);
      const input = actualizarClienteSchema.parse(req.body);
      res.status(200).json(await actualizar(id, input));
    }),
  );

  return router;
}

function parseId(raw: string | undefined): number {
  const parsed = idParamSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError("El identificador del cliente debe ser un número positivo");
  }
  return parsed.data;
}
