import { Router } from "express";

import { requireAuth } from "./auth.js";
import { requireCsrf } from "./csrf.js";

/**
 * Prepara un router con los controles que applies a toda su superficie:
 * autenticación y verificación del token CSRF en las escrituras.
 *
 * `requireCsrf` necesita `req.auth`, así que va después de `requireAuth`.
 * Los métodos seguros (GET, HEAD, OPTIONS) no lo requieren: no cambian estado
 * y no pueden ser usados para alterar datos desde otro origen.
 */
export function routerConAuth(): Router {
  const router = Router();
  router.use(requireAuth);
  router.use(requireCsrf);
  return router;
}
