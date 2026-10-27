import { PrismaClient } from "@prisma/client";

import { config } from "../config/env.js";

/**
 * Un único cliente Prisma por proceso. En desarrollo se cachea en `globalThis`
 * para que los recargas de `tsx watch` no abran un pool nuevo en cada cambio.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    // Solo errores y avisos: las consultas lentas se revisan con los logs de acceso.
    log: config.isProduction ? ["warn", "error"] : ["warn", "error"],
  });

if (!config.isProduction) {
  globalForPrisma.prisma = prisma;
}

/** Cierra el pool de conexiones de forma ordenada al apagar el proceso. */
export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}