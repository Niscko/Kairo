import type { NextFunction, Request, Response } from "express";

import { ForbiddenError, UnauthenticatedError } from "../lib/errors.js";
import { verifyAccessToken, type Rol } from "../lib/tokens.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Presente cuando la petición pasó por `requireAuth`. */
      auth?: { userId: number; rol: Rol; email: string };
    }
  }
}

/** Exige un access token válido. Deja el payload en `req.auth`. */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.get("authorization");
  if (!header?.startsWith("Bearer ")) {
    next(new UnauthenticatedError("Falta el token de acceso"));
    return;
  }
  try {
    const payload = verifyAccessToken(header.slice("Bearer ".length));
    req.auth = { userId: payload.sub, rol: payload.rol, email: payload.email };
    next();
  } catch (error) {
    next(error);
  }
}

/** Restringe la ruta a los roles indicados. Debe usarse después de `requireAuth`. */
export function requireRole(...roles: Rol[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      next(new UnauthenticatedError("Falta el token de acceso"));
      return;
    }
    if (!roles.includes(req.auth.rol)) {
      next(new ForbiddenError("Tu rol no tiene acceso a este recurso"));
      return;
    }
    next();
  };
}