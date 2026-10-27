import { Router } from "express";

import { asyncHandler } from "../../middleware/async-handler.js";
import { prisma } from "../../lib/prisma.js";

/**
 * Sondas de salud para Docker y balanceadores.
 * - /live  responde si el proceso está vivo (no toca la base de datos).
 * - /ready verifica además que la base de datos responde.
 */
export function healthRouter(): Router {
  const router = Router();

  router.get("/live", (_req, res) => {
    res.status(200).json({ status: "ok", uptime: process.uptime() });
  });

  router.get(
    "/ready",
    asyncHandler(async (_req, res) => {
      const startedAt = Date.now();
      try {
        await prisma.$queryRaw`SELECT 1`;
        res.status(200).json({ status: "ready", database: "ok", latencyMs: Date.now() - startedAt });
      } catch (error) {
        // No se lanza: la sonda debe reportar el fallo con 503, no con un 500.
        res.status(503).json({
          status: "degraded",
          database: "unavailable",
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }),
  );

  return router;
}