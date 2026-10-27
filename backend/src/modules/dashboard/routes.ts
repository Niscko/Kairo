import { type Router } from "express";

import { identidadDeUsuario } from "../../lib/clientes.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import { dashboardQuerySchema } from "./schema.js";
import { construir } from "./service.js";
import { routerConAuth } from "../../middleware/router.js";

export function dashboardRouter(): Router {
  const router = routerConAuth();

  // GET /api/dashboard — el panel cambia según el rol de quien consulta.
  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const query = dashboardQuerySchema.parse(req.query);
      const identidad = await identidadDeUsuario(req.auth!.userId, req.auth!.rol);
      res.status(200).json(await construir(query, { identidad }));
    }),
  );

  return router;
}
