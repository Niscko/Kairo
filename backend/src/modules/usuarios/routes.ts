import { Router } from "express";
import { z } from "zod";

import { ValidationError } from "../../lib/errors.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import {
  actualizarUsuarioSchema,
  crearUsuarioSchema,
  listarUsuariosQuerySchema,
} from "./schema.js";
import { actualizar, crear, listar } from "./service.js";

const idParamSchema = z.coerce.number().int().positive();

export function usuariosRouter(): Router {
  const router = Router();

  router.use(requireAuth);

  // GET /api/usuarios
  router.get(
    "/",
    requireRole("admin"),
    asyncHandler(async (req, res) => {
      const query = listarUsuariosQuerySchema.parse(req.query);
      res.status(200).json({ usuarios: await listar(query) });
    }),
  );

  // POST /api/usuarios
  router.post(
    "/",
    requireRole("admin"),
    asyncHandler(async (req, res) => {
      const input = crearUsuarioSchema.parse(req.body);
      res.status(201).json(await crear(input));
    }),
  );

  // PATCH /api/usuarios/:id
  router.patch(
    "/:id",
    requireRole("admin"),
    asyncHandler(async (req, res) => {
      const id = parseId(req.params.id);
      const input = actualizarUsuarioSchema.parse(req.body);
      res.status(200).json(await actualizar(id, input));
    }),
  );

  return router;
}

function parseId(raw: string | undefined): number {
  const parsed = idParamSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError("El identificador del usuario debe ser un número positivo");
  }
  return parsed.data;
}
