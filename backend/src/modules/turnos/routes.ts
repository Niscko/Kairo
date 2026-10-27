import { Router } from "express";

import { requireAuth, requireRole } from "../../middleware/auth.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import {
  crearTurnoSchema,
  listarEmpleadosQuerySchema,
  listarTurnosQuerySchema,
} from "./schema.js";
import { crearTurno, listarEmpleados, listarTurnos } from "./service.js";

export function turnosRouter(): Router {
  const router = Router();

  router.use(requireAuth);

  // GET /api/turnos
  router.get(
    "/",
    requireRole("admin", "empleado"),
    asyncHandler(async (req, res) => {
      const query = listarTurnosQuerySchema.parse(req.query);
      res.status(200).json(await listarTurnos(query));
    }),
  );

  // POST /api/turnos
  router.post(
    "/",
    requireRole("admin"),
    asyncHandler(async (req, res) => {
      const input = crearTurnoSchema.parse(req.body);
      res.status(201).json(await crearTurno(input));
    }),
  );

  return router;
}

export function empleadosRouter(): Router {
  const router = Router();

  router.use(requireAuth);

  // GET /api/empleados
  router.get(
    "/",
    requireRole("admin", "empleado"),
    asyncHandler(async (req, res) => {
      const query = listarEmpleadosQuerySchema.parse(req.query);
      const esAdmin = req.auth?.rol === "admin";
      res.status(200).json({ empleados: await listarEmpleados(query, esAdmin) });
    }),
  );

  return router;
}
