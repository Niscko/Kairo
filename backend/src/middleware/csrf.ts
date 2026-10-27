import type { NextFunction, Request, Response } from "express";

import { ForbiddenError } from "../lib/errors.js";
import { verifyCsrfToken } from "../lib/tokens.js";

/**
 * Verificación del token CSRF de la doble cookie.
 *
 * El backend firma una cookie legible por JavaScript (`XSRF-TOKEN`) y el
 * cliente la copia a la cabecera `X-XSRF-TOKEN` en cada escritura. Si ambas
 * coinciden y la firma es válida, la petición no puede venir de otro origen:
 * un atacante en otro sitio puede inducir al navegador a enviar la cookie,
 * pero no puede leerla para ponerla en la cabecera.
 *
 * Solo se aplica a los métodos que cambian estado. GET, HEAD y OPTIONS no
 * modifican nada y no necesitan el token.
 */
export function requireCsrf(req: Request, _res: Response, next: NextFunction): void {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    next();
    return;
  }

  const header = req.get("x-xsrf-token");
  const cookie = req.cookies?.["kairo.csrf"] as string | undefined;

  if (!header || !cookie) {
    next(new ForbiddenError("Falta el token CSRF"));
    return;
  }
  if (header !== cookie) {
    next(new ForbiddenError("El token CSRF no coincide"));
    return;
  }

  // El token va firmado con el id del usuario: aunque un atacante conseguiera
  // un token válido de otra sesión, no serviría para esta.
  const usuarioId = req.auth?.userId;
  if (usuarioId === undefined || !verifyCsrfToken(header, usuarioId)) {
    next(new ForbiddenError("El token CSRF no es válido"));
    return;
  }

  next();
}
