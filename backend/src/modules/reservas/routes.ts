import { type Router } from "express";
import { z } from "zod";

import { identidadDeUsuario } from "../../lib/clientes.js";
import { ValidationError } from "../../lib/errors.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import { cancelarReservaSchema, crearReservaSchema, listarReservasQuerySchema } from "./schema.js";
import { cancelar, crear, listar } from "./service.js";
import { routerConAuth } from "../../middleware/router.js";

const idParamSchema = z.coerce.number().int().positive();

export function reservasRouter(): Router {
  const router = routerConAuth();

  // GET /api/reservas
  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const query = listarReservasQuerySchema.parse(req.query);
      // El personal ve todas las reservas; un cliente solo las suyas.
      const identidad = await identidadDeUsuario(req.auth!.userId, req.auth!.rol);
      res.status(200).json(await listar(query, identidad));
    }),
  );

  // POST /api/reservas
  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const input = crearReservaSchema.parse(req.body);
      const identidad = await identidadDeUsuario(req.auth!.userId, req.auth!.rol);
      res.status(201).json(await crear(input, identidad));
    }),
  );

  // PATCH /api/reservas/:id — solo admite la cancelación.
  router.patch(
    "/:id",
    asyncHandler(async (req, res) => {
      const id = parseId(req.params.id);
      cancelarReservaSchema.parse(req.body);
      const identidad = await identidadDeUsuario(req.auth!.userId, req.auth!.rol);
      await cancelar(id, identidad);
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
