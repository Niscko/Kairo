import { Router } from "express";
import { z } from "zod";

import { ValidationError } from "../../lib/errors.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import {
  actualizarEspacioSchema,
  crearEspacioSchema,
  listarEspaciosQuerySchema,
} from "./schema.js";
import {
  actualizar,
  crear,
  eliminar,
  listar,
  obtener,
} from "./service.js";

const idParamSchema = z.coerce.number().int().positive();

export function espaciosRouter(): Router {
  const router = Router();

  // Todo el módulo exige sesión: incluso el listado revela la estructura del local.
  router.use(requireAuth);

  // GET /api/espacios
  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const query = listarEspaciosQuerySchema.parse(req.query);
      res.status(200).json(await listar(query));
    }),
  );

  // GET /api/espacios/:id
  router.get(
    "/:id",
    asyncHandler(async (req, res) => {
      const id = parseId(req.params.id);
      res.status(200).json(await obtener(id));
    }),
  );

  // POST /api/espacios — solo dirección.
  router.post(
    "/",
    requireRole("admin"),
    asyncHandler(async (req, res) => {
      const input = crearEspacioSchema.parse(req.body);
      res.status(201).json(await crear(input));
    }),
  );

  // PATCH /api/espacios/:id
  router.patch(
    "/:id",
    requireRole("admin"),
    asyncHandler(async (req, res) => {
      const id = parseId(req.params.id);
      const input = actualizarEspacioSchema.parse(req.body);
      res.status(200).json(await actualizar(id, input));
    }),
  );

  // DELETE /api/espacios/:id
  router.delete(
    "/:id",
    requireRole("admin"),
    asyncHandler(async (req, res) => {
      const id = parseId(req.params.id);
      await eliminar(id);
      res.status(204).send();
    }),
  );

  return router;
}

function parseId(raw: string | undefined): number {
  const parsed = idParamSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError("El identificador del espacio debe ser un número positivo");
  }
  return parsed.data;
}