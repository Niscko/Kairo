import { type Prisma } from "@prisma/client";

import { ConflictError, NotFoundError } from "../../lib/errors.js";
import { fechaISO } from "../../lib/fechas.js";
import { prisma } from "../../lib/prisma.js";
import type { ActualizarClienteInput, ListarClientesQuery } from "./schema.js";

export interface ClienteDTO {
  id: number;
  nombre: string;
  email: string;
  telefono: string | null;
  documento: string | null;
  membresia: string;
  membresiaVence: string | null;
  activo: boolean;
}

export async function listar(query: ListarClientesQuery): Promise<ClienteDTO[]> {
  const clientes = await prisma.cliente.findMany({
    where: {
      ...(query.membresia ? { membresia: query.membresia } : {}),
      ...(query.soloActivos ? { usuario: { activo: true } } : {}),
      ...(query.q
        ? {
            OR: [
              { usuario: { nombre: { contains: query.q, mode: "insensitive" } } },
              { usuario: { email: { contains: query.q, mode: "insensitive" } } },
              { documento: { contains: query.q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: { usuario: { select: { nombre: true, email: true, telefono: true, activo: true } } },
    orderBy: { usuario: { nombre: "asc" } },
  });

  return clientes.map((cliente) => ({
    id: cliente.id,
    nombre: cliente.usuario.nombre,
    email: cliente.usuario.email,
    telefono: cliente.usuario.telefono,
    documento: cliente.documento,
    membresia: cliente.membresia,
    membresiaVence: cliente.membresiaVence ? toDateOnly(cliente.membresiaVence) : null,
    activo: cliente.usuario.activo,
  }));
}

export async function obtener(id: number): Promise<ClienteDTO> {
  const cliente = await prisma.cliente.findUnique({
    where: { id },
    include: { usuario: { select: { nombre: true, email: true, telefono: true, activo: true } } },
  });
  if (!cliente) {
    throw new NotFoundError("Cliente");
  }
  return {
    id: cliente.id,
    nombre: cliente.usuario.nombre,
    email: cliente.usuario.email,
    telefono: cliente.usuario.telefono,
    documento: cliente.documento,
    membresia: cliente.membresia,
    membresiaVence: cliente.membresiaVence ? toDateOnly(cliente.membresiaVence) : null,
    activo: cliente.usuario.activo,
  };
}

export async function actualizar(id: number, input: ActualizarClienteInput): Promise<ClienteDTO> {
  const cliente = await prisma.cliente.findUnique({
    where: { id },
    include: { usuario: { select: { id: true } } },
  });
  if (!cliente) {
    throw new NotFoundError("Cliente");
  }

  // El email es único en usuarios: se comprueba antes de tocar nada.
  if (input.email && input.email !== cliente.usuario.id.toString()) {
    const ocupado = await prisma.usuario.findUnique({
      where: { email: input.email },
      select: { id: true },
    });
    if (ocupado && ocupado.id !== cliente.usuario.id) {
      throw new ConflictError(`Ya existe una cuenta con el correo ${input.email}`);
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.usuario.update({
      where: { id: cliente.usuario.id },
      data: {
        ...(input.nombre !== undefined ? { nombre: input.nombre } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.telefono !== undefined ? { telefono: input.telefono } : {}),
        ...(input.activo !== undefined ? { activo: input.activo } : {}),
      },
    });
    await tx.cliente.update({
      where: { id },
      data: {
        ...(input.documento !== undefined ? { documento: input.documento } : {}),
        ...(input.membresia !== undefined ? { membresia: input.membresia } : {}),
        ...(input.membresiaVence !== undefined
          ? { membresiaVence: input.membresiaVence ? new Date(`${input.membresiaVence}T00:00:00`) : null }
          : {}),
      },
    });
  });

  return obtener(id);
}

/** Formatea un Date como "AAAA-MM-DD" sin desfase de zona horaria. */
export function toDateOnly(fecha: Date): string {
  return fechaISO(fecha);
}

export type { Prisma };
