import rateLimit, { type Options } from "express-rate-limit";

import { config } from "../config/env.js";
import { logger } from "../config/logger.js";

const shared: Partial<Options> = {
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn({ path: req.path, ip: req.ip }, "Límite de solicitudes excedido");
    res.status(429).json({
      error: {
        code: "RATE_LIMITED",
        message: "Demasiadas solicitudes. Intenta de nuevo en unos instantes.",
      },
    });
  },
};

/** Límite general de la API. */
export const apiRateLimiter = rateLimit({
  ...shared,
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.apiRateLimitMax,
});

/**
 * Límite estricto para /auth/*: frena ataques de fuerza bruta contra el
 * login sin molestar al resto de la API.
 */
export const authRateLimiter = rateLimit({
  ...shared,
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.authRateLimitMax,
  skipSuccessfulRequests: true,
});
