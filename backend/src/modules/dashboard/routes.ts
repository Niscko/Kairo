import { Router } from "express";

import { clienteIdDeUsuario } from "../../lib/clientes.js";
import { requireAuth } from "../../middleware/auth.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import { dashboardQuerySchema } from "./schema.js";
import { construir } from "./service.js";

export function dashboardRouter(): Router {
  const router = Router();

  router.use(requireAuth);

  // GET /api/dashboard — el panel cambia según el rol de quien consulta.
  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const query = dashboardQuerySchema.parse(req.query);
      const rol = req.auth?.rol ?? "cliente";
      const clienteId =
        rol === "cliente" ? await clienteIdDeUsuario(req.auth!.userId) : null;
      res.status(200).json(await construir(query, { rol, clienteId }));
    }),
  );

  return router;
}
