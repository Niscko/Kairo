import { Router } from "express";
import { z } from "zod";

import { ValidationError } from "../../lib/errors.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import {
  actualizarCostoSchema,
  actualizarEquipoSchema,
  crearCostoSchema,
  crearEquipoSchema,
  crearPermisoSchema,
  listarCostosQuerySchema,
  listarEquiposQuerySchema,
  listarPermisosQuerySchema,
} from "./schema.js";
import {
  actualizarCosto,
  actualizarEquipo,
  crearCosto,
  crearEquipo,
  crearPermiso,
  listarCostos,
  listarEquipos,
  listarPermisos,
} from "./service.js";

const idParamSchema = z.coerce.number().int().positive();

export function equiposRouter(): Router {
  const router = Router();

  router.use(requireAuth);

  router.get(
    "/",
    requireRole("admin", "empleado"),
    asyncHandler(async (req, res) => {
      const query = listarEquiposQuerySchema.parse(req.query);
      res.status(200).json({ equipos: await listarEquipos(query) });
    }),
  );

  router.post(
    "/",
    requireRole("admin"),
    asyncHandler(async (req, res) => {
      const input = crearEquipoSchema.parse(req.body);
      res.status(201).json(await crearEquipo(input));
    }),
  );

  router.patch(
    "/:id",
    requireRole("admin", "empleado"),
    asyncHandler(async (req, res) => {
      const id = parseId(req.params.id);
      const input = actualizarEquipoSchema.parse(req.body);
      res.status(200).json(await actualizarEquipo(id, input));
    }),
  );

  return router;
}

export function costosRouter(): Router {
  const router = Router();

  router.use(requireAuth);

  // Los costos y permisos son información financiera: solo la dirección.
  router.get(
    "/",
    requireRole("admin"),
    asyncHandler(async (req, res) => {
      const query = listarCostosQuerySchema.parse(req.query);
      res.status(200).json({ costos: await listarCostos(query) });
    }),
  );

  router.post(
    "/",
    requireRole("admin"),
    asyncHandler(async (req, res) => {
      const input = crearCostoSchema.parse(req.body);
      res.status(201).json(await crearCosto(input));
    }),
  );

  router.patch(
    "/:id",
    requireRole("admin"),
    asyncHandler(async (req, res) => {
      const id = parseId(req.params.id);
      const input = actualizarCostoSchema.parse(req.body);
      res.status(200).json(await actualizarCosto(id, input));
    }),
  );

  return router;
}

export function permisosRouter(): Router {
  const router = Router();

  router.use(requireAuth);

  router.get(
    "/",
    requireRole("admin"),
    asyncHandler(async (req, res) => {
      const query = listarPermisosQuerySchema.parse(req.query);
      res.status(200).json({ permisos: await listarPermisos(query) });
    }),
  );

  router.post(
    "/",
    requireRole("admin"),
    asyncHandler(async (req, res) => {
      const input = crearPermisoSchema.parse(req.body);
      res.status(201).json(await crearPermiso(input));
    }),
  );

  return router;
}

function parseId(raw: string | undefined): number {
  const parsed = idParamSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError("El identificador debe ser un número positivo");
  }
  return parsed.data;
}
