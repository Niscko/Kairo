import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";

import { config } from "../config/env.js";
import { logger } from "../config/logger.js";
import { AppError, isAppError } from "../lib/errors.js";

/** Respuesta de error estable que consume el cliente. */
interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(
    new AppError({
      code: "NOT_FOUND",
      status: 404,
      message: `Ruta no encontrada: ${req.method} ${req.path}`,
    }),
  );
};

/**
 * Manejador terminal. Traduce cualquier error conocido a una respuesta JSON
 * coherente y registra los inesperados con su stack completo.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (res.headersSent) {
    // La respuesta ya había comenzado; no se puede reescribir el status.
    logger.error({ err, path: req.path }, "Error thrown after headers were sent");
    return;
  }

  if (err instanceof ZodError) {
    const details = err.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
      code: issue.code,
    }));
    res.status(422).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Los datos enviados no son válidos",
        details,
      },
    } satisfies ErrorBody);
    return;
  }

  if (isAppError(err)) {
    // Los 5xx son fallos del servidor y se registran; los 4xx son de cliente.
    const level = err.status >= 500 ? "error" : "warn";
    logger[level](
      { code: err.code, status: err.status, path: req.path, method: req.method },
      err.message,
    );
    res.status(err.status).json({
      error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) },
    } satisfies ErrorBody);
    return;
  }

  // Cualquier otra cosa es un fallo no previsto: se registra entero y el
  // cliente recibe un mensaje genérico para no filtrar detalles internos.
  logger.error(
    { err, path: req.path, method: req.method },
    "Fallo no previsto en el servidor",
  );
  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "Ocurrió un error interno. Intenta de nuevo más tarde.",
      ...(config.isProduction ? {} : { details: { reason: String(err) } }),
    },
  } satisfies ErrorBody);
};