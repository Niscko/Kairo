import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Envuelve un handler asíncrono para que los rechazos lleguen a `next()`.
 *
 * Express 4 no captura promesas rechazadas: sin esto, un `throw` dentro de un
 * handler `async` deja la petición colgada hasta que expira el timeout.
 */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    void handler(req, res, next).catch(next);
  };
}