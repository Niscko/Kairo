import type { Prisma } from "@prisma/client";

import type { Cambio } from "./auditoria.js";
import { prisma } from "./prisma.js";

export interface ActorAuditoria {
  userId: number;
  rol: "admin" | "empleado" | "cliente";
  email: string;
}

/**
 * Persiste un cambio ya confirmado. Si la cuenta ya no existe, el registro
 * conserva el correo y el rol que venían en el token.
 */
export async function guardarCambio(actor: ActorAuditoria, cambio: Cambio): Promise<void> {
  const usuario = await prisma.usuario.findUnique({
    where: { id: actor.userId },
    select: { id: true, nombre: true, email: true, rol: true },
  });

  await prisma.registroActividad.create({
    data: {
      usuarioId: usuario?.id,
      actorNombre: usuario?.nombre ?? actor.email,
      actorEmail: usuario?.email ?? actor.email,
      actorRol: usuario?.rol ?? actor.rol,
      accion: cambio.accion,
      entidad: cambio.entidad,
      entidadId: cambio.entidadId,
      resumen: cambio.resumen,
      detalle: cambio.detalle as Prisma.InputJsonValue,
    },
  });
}
