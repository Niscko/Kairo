import { createServer } from "node:http";

import { createApp } from "./app.js";
import { config } from "./config/env.js";
import { logger } from "./config/logger.js";
import { disconnectPrisma, prisma } from "./lib/prisma.js";

const app = createApp();
const server = createServer(app);

server.listen(config.PORT, () => {
  logger.info({ port: config.PORT, env: config.NODE_ENV }, "Kairo API escuchando");
});

/**
 * Cierre ordenado: deja de aceptar conexiones, espera a que terminen las
 * peticiones en vuelo y cierra el pool de Prisma. Sin esto, `docker compose
 * down` corta peticiones a la mitad.
 */
let shuttingDown = false;

function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Apagando el servidor");

  server.close(async (error) => {
    if (error) {
      logger.error({ err: error }, "Error al cerrar el servidor HTTP");
      process.exitCode = 1;
    }
    try {
      await disconnectPrisma();
      logger.info("Conexiones cerradas correctamente");
    } catch (prismaError) {
      logger.error({ err: prismaError }, "Error al cerrar el pool de Prisma");
      process.exitCode = 1;
    }
    process.exit();
  });

  // Si alguna conexión se queda colgada, forzamos la salida.
  setTimeout(() => {
    logger.error("Apagado forzado tras agotar el tiempo de espera");
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "Promesa rechazada sin manejar");
});

process.on("uncaughtException", (error) => {
  logger.fatal({ err: error }, "Excepción no capturada; apagando el proceso");
  shutdown("uncaughtException");
});

// Verifica la base de datos al arrancar para fallar rápido y de forma visible
// si la configuración de conexión es incorrecta.
prisma
  .$queryRaw`SELECT 1`
  .then(() => logger.info("Conexión con la base de datos verificada"))
  .catch((error: unknown) => {
    logger.fatal({ err: error }, "No se pudo conectar con la base de datos");
    process.exit(1);
  });