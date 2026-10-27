import crypto from "node:crypto";

import jwt from "jsonwebtoken";

import { config } from "../config/env.js";
import { UnauthenticatedError } from "./errors.js";

export type Rol = "admin" | "empleado" | "cliente";

export interface AccessTokenPayload {
  sub: number;
  rol: Rol;
  email: string;
}

/** Convierte "15m" / "7d" a segundos, que es lo que jsonwebtoken espera. */
function durationToSeconds(value: string): number {
  const match = /^(\d+)(ms|s|m|h|d)$/.exec(value);
  if (!match) {
    // env.ts ya valida el formato; si llegamos aquí es un fallo de programación.
    throw new Error(`JWT_ACCESS_TTL con formato inválido: ${value}`);
  }
  const amount = Number(match[1]);
  const unit = match[2] as string;
  const factors: Record<string, number> = { ms: 1 / 1000, s: 1, m: 60, h: 3600, d: 86400 };
  return Math.floor(amount * (factors[unit] as number));
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign({ rol: payload.rol, email: payload.email }, config.JWT_ACCESS_SECRET, {
    subject: String(payload.sub),
    expiresIn: durationToSeconds(config.JWT_ACCESS_TTL),
    issuer: "kairo",
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, config.JWT_ACCESS_SECRET, {
      issuer: "kairo",
      algorithms: ["HS256"],
    });
    if (typeof decoded === "string" || typeof decoded.sub !== "string") {
      throw new UnauthenticatedError("Token de acceso malformado");
    }
    const rol = (decoded as { rol?: unknown }).rol;
    const email = (decoded as { email?: unknown }).email;
    if (typeof rol !== "string" || typeof email !== "string") {
      throw new UnauthenticatedError("Token de acceso incompleto");
    }
    return { sub: Number(decoded.sub), rol: rol as Rol, email };
  } catch (error) {
    if (error instanceof UnauthenticatedError) throw error;
    if (error instanceof jwt.TokenExpiredError) {
      throw new UnauthenticatedError("El token de acceso expiró");
    }
    throw new UnauthenticatedError("Token de acceso inválido");
  }
}

/**
 * Los refresh tokens son opacos y aleatorios, no JWT: se guardan hasheados en
 * la base de datos, lo que permite revocarlos y detectar reuso.
 */
export function generateRefreshToken(): string {
  return crypto.randomBytes(48).toString("base64url");
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function refreshTokenTtlSeconds(): number {
  return durationToSeconds(config.JWT_REFRESH_TTL);
}

/** Firma y verifica el token CSRF de la doble cookie. */
export function signCsrfToken(userId: number): string {
  return jwt.sign({ uid: userId }, config.CSRF_SECRET, {
    expiresIn: refreshTokenTtlSeconds(),
    issuer: "kairo-csrf",
  });
}

export function verifyCsrfToken(token: string, userId: number): boolean {
  try {
    const decoded = jwt.verify(token, config.CSRF_SECRET, {
      issuer: "kairo-csrf",
      algorithms: ["HS256"],
    });
    return typeof decoded === "object" && decoded !== null && (decoded as { uid?: unknown }).uid === userId;
  } catch {
    return false;
  }
}