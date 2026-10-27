import pino from "pino";

import { config } from "./env.js";

/**
 * Claves cuyo valor nunca debe quedar en los logs. Cubre credenciales,
 * tokens y datos personales de los clientes (documento, teléfono).
 */
const REDACTED_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  "req.headers['x-csrf-token']",
  "req.headers['x-xsrf-token']",
  "res.headers['set-cookie']",
  "password",
  "passwordHash",
  "password_hash",
  "token",
  "accessToken",
  "refreshToken",
  "codigoHash",
  "telefono",
  "documento",
];

export const logger = pino({
  level: config.LOG_LEVEL,
  redact: {
    paths: REDACTED_PATHS,
    censor: "[redactado]",
  },
  base: { service: "kairo-backend" },
  timestamp: pino.stdTimeFunctions.isoTime,
  // El transporte legible requiere pino-pretty, que solo se instala en
  // desarrollo. En producción se usa el JSON por defecto: si el host corre con
  // NODE_ENV=development, no debe fallar por una dependencia ausente.
  ...(config.prettyLogs ? { transport: prettyTransport() } : {}),
});

function prettyTransport(): pino.TransportSingleOptions {
  return {
    target: "pino-pretty",
    options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname,service" },
  };
}