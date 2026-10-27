import { type Router } from "express";

import { requireRole } from "../../middleware/auth.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import { routerConAuth } from "../../middleware/router.js";
import { listarRegistrosQuerySchema } from "./schema.js";
import { listar } from "./service.js";

export function registrosRouter(): Router {
  const router = routerConAuth();

  // GET /api/registros — la bitácora de altas y bajas es solo de dirección.
  router.get(
    "/",
    requireRole("admin"),
    asyncHandler(async (req, res) => {
      const query = listarRegistrosQuerySchema.parse(req.query);
      res.status(200).json(await listar(query));
    }),
  );

  return router;
}
