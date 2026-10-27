import bcrypt from "bcryptjs";
import { type Prisma } from "@prisma/client";

import { config } from "../../config/env.js";
import { ConflictError, NotFoundError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import type { ActualizarUsuarioInput, CrearUsuarioInput, ListarUsuariosQuery } from "./schema.js";

export interface UsuarioDTO {
  id: number;
  nombre: string;
  email: string;
  rol: string;
  telefono: string | null;
  activo: boolean;
  creadoEn: string;
  /** Datos del perfil asociado, si existe. */
  empleado: { id: number; cargo: string } | null;
  cliente: { id: number; membresia: string } | null;
}

export async function listar(query: ListarUsuariosQuery): Promise<UsuarioDTO[]> {
  const usuarios = await prisma.usuario.findMany({
    where: {
      ...(query.rol ? { rol: query.rol } : {}),
      ...(query.q
        ? {
            OR: [
              { nombre: { contains: query.q, mode: "insensitive" } },
              { email: { contains: query.q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: {
      empleado: { select: { id: true, cargo: true } },
      cliente: { select: { id: true, membresia: true } },
    },
    orderBy: { nombre: "asc" },
  });

  return usuarios.map((usuario) => ({
    id: usuario.id,
    nombre: usuario.nombre,
    email: usuario.email,
    rol: usuario.rol,
    telefono: usuario.telefono,
    activo: usuario.activo,
    creadoEn: usuario.creadoEn.toISOString(),
    empleado: usuario.empleado ? { id: usuario.empleado.id, cargo: usuario.empleado.cargo } : null,
    cliente: usuario.cliente
      ? { id: usuario.cliente.id, membresia: usuario.cliente.membresia }
      : null,
  }));
}

/**
 * Crea una cuenta y su perfil según el rol: un empleado necesita cargo y
 * salario; un cliente, documento y membresía.
 */
export async function crear(input: CrearUsuarioInput): Promise<{ id: number }> {
  const email = input.email.toLowerCase();
  const existente = await prisma.usuario.findUnique({ where: { email }, select: { id: true } });
  if (existente) {
    throw new ConflictError(`Ya existe una cuenta con el correo ${email}`);
  }

  const passwordHash = await bcrypt.hash(input.password, config.BCRYPT_COST);

  return prisma.$transaction(async (tx) => {
    const usuario = await tx.usuario.create({
      data: {
        nombre: input.nombre,
        email,
        passwordHash,
        rol: input.rol,
        telefono: input.telefono ?? null,
      },
      select: { id: true },
    });

    if (input.rol === "empleado") {
      await tx.empleado.create({
        data: {
          usuarioId: usuario.id,
          cargo: input.cargo ?? "Sin cargo",
          salario: input.salario ?? 0,
          fechaIngreso: new Date(),
        },
      });
    } else if (input.rol === "cliente") {
      await tx.cliente.create({
        data: {
          usuarioId: usuario.id,
          documento: input.documento ?? null,
          membresia: input.membresia ?? "ninguna",
        },
      });
    }

    return { id: usuario.id };
  });
}

export async function actualizar(id: number, input: ActualizarUsuarioInput): Promise<UsuarioDTO> {
  const usuario = await prisma.usuario.findUnique({
    where: { id },
    select: { id: true, rol: true },
  });
  if (!usuario) {
    throw new NotFoundError("Usuario");
  }

  if (input.email) {
    const email = input.email.toLowerCase();
    const ocupado = await prisma.usuario.findUnique({ where: { email }, select: { id: true } });
    if (ocupado && ocupado.id !== id) {
      throw new ConflictError(`Ya existe una cuenta con el correo ${email}`);
    }
  }

  // El cambio de rol va en una transacción junto con la creación del perfil
  // correspondiente. Si se actualiza el rol y el perfil se crea aparte, queda
  // un instante (y a veces un estado permanente) en el que la cuenta dice
  // `cliente` sin tener perfil de cliente: el personal la trataría como
  // cliente y el cliente, como personal.
  await prisma.$transaction(async (tx) => {
    if (input.rol !== undefined && input.rol !== usuario.rol) {
      if (input.rol === "cliente") {
        await tx.cliente.upsert({
          where: { usuarioId: id },
          create: { usuarioId: id, documento: null, membresia: "ninguna" },
          update: {},
        });
      } else {
        await tx.cliente.deleteMany({ where: { usuarioId: id } });
      }

      if (input.rol === "empleado") {
        await tx.empleado.upsert({
          where: { usuarioId: id },
          create: { usuarioId: id, cargo: "Sin cargo", salario: 0, fechaIngreso: new Date() },
          update: {},
        });
      } else {
        await tx.empleado.deleteMany({ where: { usuarioId: id } });
      }
    }

    await tx.usuario.update({
      where: { id },
      data: {
        ...(input.nombre !== undefined ? { nombre: input.nombre } : {}),
        ...(input.email !== undefined ? { email: input.email.toLowerCase() } : {}),
        ...(input.telefono !== undefined ? { telefono: input.telefono } : {}),
        ...(input.rol !== undefined ? { rol: input.rol } : {}),
        ...(input.activo !== undefined ? { activo: input.activo } : {}),
      },
    });
  });

  const actualizado = await prisma.usuario.findUnique({
    where: { id },
    include: {
      empleado: { select: { id: true, cargo: true } },
      cliente: { select: { id: true, membresia: true } },
    },
  });
  if (!actualizado) {
    throw new NotFoundError("Usuario");
  }

  return {
    id: actualizado.id,
    nombre: actualizado.nombre,
    email: actualizado.email,
    rol: actualizado.rol,
    telefono: actualizado.telefono,
    activo: actualizado.activo,
    creadoEn: actualizado.creadoEn.toISOString(),
    empleado: actualizado.empleado
      ? { id: actualizado.empleado.id, cargo: actualizado.empleado.cargo }
      : null,
    cliente: actualizado.cliente
      ? { id: actualizado.cliente.id, membresia: actualizado.cliente.membresia }
      : null,
  };
}

export type { Prisma };
