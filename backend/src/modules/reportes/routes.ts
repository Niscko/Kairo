import { type Router } from "express";

import { requireRole } from "../../middleware/auth.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import { reporteQuerySchema } from "./schema.js";
import { construir } from "./service.js";
import { routerConAuth } from "../../middleware/router.js";

export function reportesRouter(): Router {
  const router = routerConAuth();

  // GET /api/reportes — el reporte muestra costos y márgenes: solo la dirección.
  router.get(
    "/",
    requireRole("admin"),
    asyncHandler(async (req, res) => {
      const query = reporteQuerySchema.parse(req.query);
      res.status(200).json(await construir(query));
    }),
  );

  return router;
}
