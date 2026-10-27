import { type Router } from "express";
import { z } from "zod";

import { identidadDeUsuario } from "../../lib/clientes.js";
import { ValidationError } from "../../lib/errors.js";
import { requireRole } from "../../middleware/auth.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import {
  agregarParticipanteSchema,
  crearExperienciaSchema,
  listarExperienciasQuerySchema,
} from "./schema.js";
import { agregarParticipante, cancelar, cerrar, crear, listar } from "./service.js";
import { routerConAuth } from "../../middleware/router.js";

const idParamSchema = z.coerce.number().int().positive();

export function experienciasRouter(): Router {
  const router = routerConAuth();

  // GET /api/experiencias
  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const query = listarExperienciasQuerySchema.parse(req.query);
      res.status(200).json({ experiencias: await listar(query) });
    }),
  );

  // POST /api/experiencias
  router.post(
    "/",
    requireRole("admin", "empleado"),
    asyncHandler(async (req, res) => {
      const input = crearExperienciaSchema.parse(req.body);
      res.status(201).json(await crear(input));
    }),
  );

  // POST /api/experiencias/:id/participantes
  router.post(
    "/:id/participantes",
    asyncHandler(async (req, res) => {
      const id = parseId(req.params.id);
      const body = agregarParticipanteSchema.parse(req.body);

      // Un cliente se inscribe a sí mismo; el personal puede Inscribir a otro.
      const identidad = await identidadDeUsuario(req.auth!.userId, req.auth!.rol);
      const clienteId = identidad.rol === "cliente" ? identidad.clienteId : body.clienteId;
      if (!clienteId) {
        throw new ValidationError("Selecciona al participante");
      }

      res.status(201).json(await agregarParticipante(id, clienteId));
    }),
  );

  // POST /api/experiencias/:id/cerrar
  router.post(
    "/:id/cerrar",
    requireRole("admin", "empleado"),
    asyncHandler(async (req, res) => {
      const id = parseId(req.params.id);
      await cerrar(id);
      res.status(200).json({ ok: true });
    }),
  );

  // POST /api/experiencias/:id/cancelar
  router.post(
    "/:id/cancelar",
    requireRole("admin", "empleado"),
    asyncHandler(async (req, res) => {
      const id = parseId(req.params.id);
      await cancelar(id);
      res.status(200).json({ ok: true });
    }),
  );

  return router;
}

function parseId(raw: string | undefined): number {
  const parsed = idParamSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError("El identificador de la experiencia debe ser un número positivo");
  }
  return parsed.data;
}
