import { type Router } from "express";

import { identidadDeUsuario } from "../../lib/clientes.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import { agendaQuerySchema } from "./schema.js";
import { construir } from "./service.js";
import { routerConAuth } from "../../middleware/router.js";

export function agendaRouter(): Router {
  const router = routerConAuth();

  // GET /api/agenda — el día en curso: reservas, turnos, experiencias y ocupación.
  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const query = agendaQuerySchema.parse(req.query);
      const identidad = await identidadDeUsuario(req.auth!.userId, req.auth!.rol);
      res.status(200).json(await construir(query, { identidad }));
    }),
  );

  return router;
}
