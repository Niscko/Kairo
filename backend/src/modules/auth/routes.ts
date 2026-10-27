import crypto from "node:crypto";

import bcrypt from "bcryptjs";
import { Router, type Request, type Response } from "express";
import { z } from "zod";

import { config } from "../../config/env.js";
import { prisma } from "../../lib/prisma.js";
import {
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenTtlSeconds,
  signAccessToken,
  signCsrfToken,
  verifyAccessToken,
} from "../../lib/tokens.js";
import { UnauthenticatedError } from "../../lib/errors.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import { authRateLimiter } from "../../middleware/rate-limit.js";

const REFRESH_COOKIE = "kairo.refresh";
const CSRF_COOKIE = "kairo.csrf";

const loginSchema = z.object({
  email: z.string().email("Correo electrónico inválido"),
  password: z.string().min(1, "La contraseña es obligatoria"),
});

interface PublicUser {
  id: number;
  nombre: string;
  email: string;
  rol: string;
}

type UsuarioLike = { id: number; nombre: string; email: string; rol: string };

function toPublicUser(user: UsuarioLike): PublicUser {
  return { id: user.id, nombre: user.nombre, email: user.email, rol: user.rol };
}

/**
 * Hash señuelo. Se compara contra él cuando el correo no existe para que el
 * tiempo de respuesta sea equivalente y no permita enumerar cuentas.
 */
const DUMMY_HASH = bcrypt.hashSync("kairo-sentinel-password", config.BCRYPT_COST);

function setAuthCookies(res: Response, refreshToken: string, userId: number): void {
  const maxAgeMs = refreshTokenTtlSeconds() * 1000;
  res.cookie(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: "lax",
    path: "/api/auth",
    maxAge: maxAgeMs,
  });
  // Legible por JS a propósito: el frontend lo copia a la cabecera X-XSRF-TOKEN.
  res.cookie(CSRF_COOKIE, signCsrfToken(userId), {
    httpOnly: false,
    secure: config.isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeMs,
  });
}

function clearAuthCookies(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, { path: "/api/auth", secure: config.isProduction });
  res.clearCookie(CSRF_COOKIE, { path: "/", secure: config.isProduction });
}

function readRefreshCookie(req: Request): string | null {
  const value: unknown = req.cookies?.[REFRESH_COOKIE];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function authRouter(): Router {
  const router = Router();

  // POST /api/auth/login
  router.post(
    "/login",
    authRateLimiter,
    asyncHandler(async (req, res) => {
      const body = loginSchema.parse(req.body);

      const user = await prisma.usuario.findUnique({
        where: { email: body.email.toLowerCase() },
      });

      const hash = user?.passwordHash ?? DUMMY_HASH;
      const passwordMatches = await bcrypt.compare(body.password, hash);

      if (!user || !passwordMatches) {
        throw new UnauthenticatedError("Correo o contraseña incorrectos");
      }
      if (!user.activo) {
        throw new UnauthenticatedError("Tu cuenta está inactiva");
      }

      const refreshToken = generateRefreshToken();
      await prisma.sesionRefresh.create({
        data: {
          usuarioId: user.id,
          tokenHash: hashRefreshToken(refreshToken),
          familia: crypto.randomUUID(),
          expira: new Date(Date.now() + refreshTokenTtlSeconds() * 1000),
          userAgent: req.get("user-agent")?.slice(0, 255) ?? null,
        },
      });

      setAuthCookies(res, refreshToken, user.id);
      res.status(200).json({
        user: toPublicUser(user),
        accessToken: signAccessToken({ sub: user.id, rol: user.rol, email: user.email }),
      });
    }),
  );

  // POST /api/auth/refresh
  //
  // La rotación crea una fila nueva encadenada por `familia` y marca la anterior
  // como revocada. Si un token ya revocado vuelve a presentarse, se assume robo
  // de credenciales y se revoca la familia entera.
  router.post(
    "/refresh",
    asyncHandler(async (req, res) => {
      const presented = readRefreshCookie(req);
      if (!presented) {
        throw new UnauthenticatedError("No hay sesión activa");
      }

      const tokenHash = hashRefreshToken(presented);
      const session = await prisma.sesionRefresh.findUnique({
        where: { tokenHash },
        include: { usuario: true },
      });

      if (!session) {
        throw new UnauthenticatedError("Sesión inválida");
      }

      if (session.revocado || session.reemplazadoPorId !== null) {
        await prisma.sesionRefresh.updateMany({
          where: { familia: session.familia, revocado: null },
          data: { revocado: new Date() },
        });
        clearAuthCookies(res);
        throw new UnauthenticatedError("Sesión invalidada por seguridad");
      }

      if (session.expira < new Date()) {
        clearAuthCookies(res);
        throw new UnauthenticatedError("La sesión expiró");
      }

      if (!session.usuario.activo) {
        clearAuthCookies(res);
        throw new UnauthenticatedError("Tu cuenta está inactiva");
      }

      const nextRefresh = generateRefreshToken();

      const previous = await prisma.sesionRefresh.update({
        where: { id: session.id },
        data: { revocado: new Date() },
      });

      const created = await prisma.sesionRefresh.create({
        data: {
          usuarioId: session.usuarioId,
          tokenHash: hashRefreshToken(nextRefresh),
          familia: session.familia,
          expira: new Date(Date.now() + refreshTokenTtlSeconds() * 1000),
          userAgent: req.get("user-agent")?.slice(0, 255) ?? null,
        },
      });

      await prisma.sesionRefresh.update({
        where: { id: previous.id },
        data: { reemplazadoPorId: created.id },
      });

      setAuthCookies(res, nextRefresh, session.usuario.id);
      res.setHeader("X-Refresh-Expires", String(created.expira.getTime()));
      res.status(200).json({
        user: toPublicUser(session.usuario),
        accessToken: signAccessToken({
          sub: session.usuario.id,
          rol: session.usuario.rol,
          email: session.usuario.email,
        }),
      });
    }),
  );

  // POST /api/auth/logout
  router.post(
    "/logout",
    asyncHandler(async (req, res) => {
      const presented = readRefreshCookie(req);
      if (presented) {
        await prisma.sesionRefresh.updateMany({
          where: { tokenHash: hashRefreshToken(presented), revocado: null },
          data: { revocado: new Date() },
        });
      }
      clearAuthCookies(res);
      res.status(204).send();
    }),
  );

  // GET /api/auth/me
  router.get(
    "/me",
    asyncHandler(async (req, res) => {
      const header = req.get("authorization");
      if (!header?.startsWith("Bearer ")) {
        throw new UnauthenticatedError("Falta el token de acceso");
      }
      const payload = verifyAccessToken(header.slice("Bearer ".length));

      const user = await prisma.usuario.findUnique({ where: { id: payload.sub } });
      if (!user || !user.activo) {
        throw new UnauthenticatedError("Sesión no válida");
      }
      res.status(200).json({ user: toPublicUser(user) });
    }),
  );

  return router;
}