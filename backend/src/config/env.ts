import path from "node:path";
import { fileURLToPath } from "node:url";

import { config as loadDotenv } from "dotenv";
import { z } from "zod";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Raíz del paquete backend (dos niveles arriba de src/config). */
export const BACKEND_ROOT = path.resolve(here, "..", "..");

// El .env vive en la raíz del monorepo; dentro de Docker las variables llegan por entorno.
loadDotenv({ path: path.join(BACKEND_ROOT, "..", ".env") });
loadDotenv({ path: path.join(BACKEND_ROOT, ".env") });

/**
 * Declara los límites de longitud de cada secreto para que un valor de
 * desarrollo no llegue por accidente a producción.
 */
const secret = (label: string) =>
  z.string().min(32, `${label} debe tener al menos 32 caracteres`).describe(label);

/**
 * Duración tipo "15m", "7d", "900s". Se valida el formato porque un valor mal
 * escrito en JWT_TTL rompería el refresh en runtime sin avisar en el arranque.
 */
const duration = z
  .string()
  .regex(/^\d+(ms|s|m|h|d)$/, "Usa un formato de duración como 15m, 7d o 900s");

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(3001),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
    CORS_ORIGINS: z.string().default("http://localhost:5173"),
    DATABASE_URL: z.string().min(1, "DATABASE_URL es obligatoria"),
    JWT_ACCESS_SECRET: secret("JWT_ACCESS_SECRET"),
    JWT_REFRESH_SECRET: secret("JWT_REFRESH_SECRET"),
    JWT_ACCESS_TTL: duration.default("15m"),
    JWT_REFRESH_TTL: duration.default("7d"),
    BCRYPT_COST: z.coerce.number().int().min(10).max(15).default(12),
    CSRF_SECRET: secret("CSRF_SECRET"),
    RATE_LIMIT_WINDOW_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(15 * 60 * 1000),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
    /**
     * Relaja el límite de autenticación. Solo para entornos de prueba: la
     * suite e2e hace muchas peticiones desde la misma IP.
     */
    RELAJAR_RATE_LIMIT: z
      .enum(["true", "false"])
      .default("false")
      .transform((valor) => valor === "true"),
  })
  .superRefine((value, ctx) => {
    if (value.JWT_ACCESS_SECRET === value.JWT_REFRESH_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["JWT_REFRESH_SECRET"],
        message: "JWT_REFRESH_SECRET debe ser distinto de JWT_ACCESS_SECRET",
      });
    }
    if (value.JWT_ACCESS_SECRET === value.CSRF_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["CSRF_SECRET"],
        message: "CSRF_SECRET debe ser distinto de JWT_ACCESS_SECRET",
      });
    }
  });

export type Config = z.infer<typeof schema> & {
  isProduction: boolean;
  isTest: boolean;
  /** Salida legible por terminal. Requiere pino-pretty (solo devDependencies). */
  prettyLogs: boolean;
  /** Límite de intentos de autenticación por IP. */
  authRateLimitMax: number;
  /** Límite general de peticiones por IP. */
  apiRateLimitMax: number;
  corsOrigins: string[];
};

function load(): Config {
  const parsed = schema.safeParse(process.env);

  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(raíz)"}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Configuración de entorno inválida. Revisa backend/.env o las variables del contenedor:\n${detail}`,
    );
  }

  const env = parsed.data;
  const isProduction = env.NODE_ENV === "production";
  const isTest = env.NODE_ENV === "test";

  return {
    ...env,
    isProduction,
    isTest,
    // En tests nunca se abre un worker de pino: ralentiza y ensucia la salida.
    prettyLogs: !isProduction && !isTest,
    // Los límites se miden por IP. En las pruebas de extremo a extremo todas
    // las peticiones salen de la misma, así que un límite bajo bloquearía la
    // suite; se relajan cuando se pide explícitamente.
    authRateLimitMax: isTest || env.RELAJAR_RATE_LIMIT ? 10_000 : env.AUTH_RATE_LIMIT_MAX,
    apiRateLimitMax: isTest || env.RELAJAR_RATE_LIMIT ? 10_000 : env.RATE_LIMIT_MAX,
    corsOrigins: env.CORS_ORIGINS.split(",")
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
  };
}

export const config: Config = load();
