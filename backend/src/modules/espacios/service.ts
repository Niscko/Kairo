import type { Prisma } from "@prisma/client";

import { prisma } from "../../lib/prisma.js";
import { ConflictError, NotFoundError } from "../../lib/errors.js";
import type {
  ActualizarEspacioInput,
  CrearEspacioInput,
  ListarEspaciosQuery,
} from "./schema.js";

export interface Paginado<T> {
  datos: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPaginas: number;
}

export async function listar(query: ListarEspaciosQuery): Promise<Paginado<EspacioDTO>> {
  const where: Prisma.EspacioWhereInput = {
    ...(query.tipo ? { tipo: query.tipo } : {}),
    ...(query.estado ? { estado: query.estado } : {}),
    ...(query.zona ? { zona: { equals: query.zona, mode: "insensitive" } } : {}),
  };

  const [total, datos] = await prisma.$transaction([
    prisma.espacio.count({ where }),
    prisma.espacio.findMany({
      where,
      orderBy: [{ zona: "asc" }, { nombre: "asc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  return {
    datos,
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPaginas: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function obtener(id: number): Promise<EspacioDTO> {
  const espacio = await prisma.espacio.findUnique({ where: { id } });
  if (!espacio) {
    throw new NotFoundError("Espacio");
  }
  return espacio;
}

export async function crear(input: CrearEspacioInput): Promise<EspacioDTO> {
  const existente = await prisma.espacio.findFirst({
    where: { nombre: { equals: input.nombre, mode: "insensitive" } },
    select: { id: true },
  });
  if (existente) {
    throw new ConflictError(`Ya existe un espacio llamado "${input.nombre}"`);
  }

  return prisma.espacio.create({
    data: {
      nombre: input.nombre,
      tipo: input.tipo,
      capacidad: input.capacidad,
      tarifaHora: input.tarifaHora,
      zona: input.zona,
    },
  });
}

export async function actualizar(id: number, input: ActualizarEspacioInput): Promise<EspacioDTO> {
  await obtener(id); // 404 explícito si no existe.

  if (input.nombre) {
    const duplicado = await prisma.espacio.findFirst({
      where: { nombre: { equals: input.nombre, mode: "insensitive" }, NOT: { id } },
      select: { id: true },
    });
    if (duplicado) {
      throw new ConflictError(`Ya existe otro espacio llamado "${input.nombre}"`);
    }
  }

  return prisma.espacio.update({ where: { id }, data: input });
}

export async function eliminar(id: number): Promise<void> {
  const espacio = await prisma.espacio.findUnique({
    where: { id },
    select: {
      _count: { select: { reservas: { where: { estado: { not: "cancelada" } } } } },
    },
  });
  if (!espacio) {
    throw new NotFoundError("Espacio");
  }
  if (espacio._count.reservas > 0) {
    throw new ConflictError(
      "No se puede eliminar un espacio con reservas activas. Cáncelas o marca el espacio en mantenimiento.",
    );
  }

  await prisma.espacio.delete({ where: { id } });
}

export type EspacioDTO = {
  id: number;
  nombre: string;
  tipo: string;
  capacidad: number;
  tarifaHora: number;
  zona: string;
  estado: string;
};