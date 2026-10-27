import { Router } from "express";

import { clienteIdDeUsuario } from "../../lib/clientes.js";
import { requireAuth } from "../../middleware/auth.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import { agendaQuerySchema } from "./schema.js";
import { construir } from "./service.js";

export function agendaRouter(): Router {
  const router = Router();

  router.use(requireAuth);

  // GET /api/agenda — el día en curso: reservas, turnos, experiencias y ocupación.
  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const query = agendaQuerySchema.parse(req.query);
      const rol = req.auth?.rol ?? "cliente";
      // Un cliente solo ve sus propias reservas.
      const clienteId = rol === "cliente" ? await clienteIdDeUsuario(req.auth!.userId) : null;
      res.status(200).json(await construir(query, { clienteId }));
    }),
  );

  return router;
}
