import type { Prisma } from "@prisma/client";

import type { DetalleAuditoria } from "../../lib/auditoria.js";
import { prisma } from "../../lib/prisma.js";
import type { Paginado } from "../espacios/service.js";
import type { ListarRegistrosQuery } from "./schema.js";

export interface RegistroDTO {
  id: number;
  creadoEn: string;
  actorNombre: string;
  actorEmail: string;
  actorRol: "admin" | "empleado" | "cliente" | null;
  accion: "crear" | "actualizar" | "eliminar";
  entidad: string;
  entidadId: string | null;
  resumen: string;
  detalle: DetalleAuditoria | null;
}

export async function listar(query: ListarRegistrosQuery): Promise<Paginado<RegistroDTO>> {
  const where: Prisma.RegistroActividadWhereInput = {
    ...(query.accion ? { accion: query.accion } : {}),
    ...(query.entidad ? { entidad: query.entidad } : {}),
  };

  const [total, filas] = await prisma.$transaction([
    prisma.registroActividad.count({ where }),
    prisma.registroActividad.findMany({
      where,
      orderBy: [{ creadoEn: "desc" }, { id: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  return {
    datos: filas.map((fila) => ({
      id: fila.id,
      creadoEn: fila.creadoEn.toISOString(),
      actorNombre: fila.actorNombre,
      actorEmail: fila.actorEmail,
      actorRol: fila.actorRol,
      accion: fila.accion,
      entidad: fila.entidad,
      entidadId: fila.entidadId,
      resumen: fila.resumen,
      detalle: detalleDe(fila.detalle),
    })),
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPaginas: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

function detalleDe(valor: Prisma.JsonValue | null): DetalleAuditoria | null {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return null;
  const detalle: DetalleAuditoria = {};
  for (const [clave, item] of Object.entries(valor)) {
    if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
      detalle[clave] = item;
    } else if (item === null) {
      detalle[clave] = null;
    }
  }
  return detalle;
}
