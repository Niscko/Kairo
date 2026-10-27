import { NotFoundError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { toDateOnly } from "../clientes/service.js";
import type {
  ActualizarCostoInput,
  ActualizarEquipoInput,
  CrearCostoInput,
  CrearEquipoInput,
  CrearPermisoInput,
} from "./schema.js";

// --- Equipos ----------------------------------------------------------------

export async function listarEquipos(query: {
  q?: string;
  tipo?: string;
  estado?: string;
}) {
  const equipos = await prisma.equipo.findMany({
    where: {
      ...(query.tipo ? { tipo: query.tipo as never } : {}),
      ...(query.estado ? { estado: query.estado as never } : {}),
      ...(query.q ? { nombre: { contains: query.q, mode: "insensitive" } } : {}),
    },
    include: { espacio: { select: { nombre: true } } },
    orderBy: { nombre: "asc" },
  });

  return equipos.map((equipo) => ({
    id: equipo.id,
    nombre: equipo.nombre,
    tipo: equipo.tipo,
    estado: equipo.estado,
    espacio: equipo.espacio?.nombre ?? null,
    costo: equipo.costo,
  }));
}

export async function crearEquipo(input: CrearEquipoInput) {
  return prisma.equipo.create({
    data: {
      nombre: input.nombre,
      tipo: input.tipo,
      estado: input.estado,
      espacioId: input.espacioId ?? null,
      costo: input.costo,
    },
    select: { id: true, nombre: true },
  });
}

export async function actualizarEquipo(id: number, input: ActualizarEquipoInput) {
  const equipo = await prisma.equipo.findUnique({ where: { id }, select: { id: true } });
  if (!equipo) {
    throw new NotFoundError("Equipo");
  }
  return prisma.equipo.update({
    where: { id },
    data: {
      ...(input.nombre !== undefined ? { nombre: input.nombre } : {}),
      ...(input.tipo !== undefined ? { tipo: input.tipo } : {}),
      ...(input.estado !== undefined ? { estado: input.estado } : {}),
      ...(input.espacioId !== undefined ? { espacioId: input.espacioId } : {}),
      ...(input.costo !== undefined ? { costo: input.costo } : {}),
    },
    select: { id: true, nombre: true, estado: true },
  });
}

// --- Costos -----------------------------------------------------------------

export async function listarCostos(query: { periodo?: string; estado?: string }) {
  const costos = await prisma.costo.findMany({
    where: {
      ...(query.periodo ? { periodo: query.periodo } : {}),
      ...(query.estado ? { estado: query.estado as never } : {}),
    },
    orderBy: [{ periodo: "desc" }, { vencimiento: "asc" }],
  });

  return costos.map((costo) => ({
    id: costo.id,
    concepto: costo.concepto,
    categoria: costo.categoria,
    monto: costo.monto,
    periodo: costo.periodo,
    vencimiento: costo.vencimiento ? toDateOnly(costo.vencimiento) : null,
    estado: costo.estado,
  }));
}

export async function crearCosto(input: CrearCostoInput) {
  return prisma.costo.create({
    data: {
      concepto: input.concepto,
      categoria: input.categoria,
      monto: input.monto,
      periodo: input.periodo,
      vencimiento: input.vencimiento ? new Date(`${input.vencimiento}T00:00:00`) : null,
      estado: input.estado,
    },
    select: { id: true, concepto: true, monto: true },
  });
}

export async function actualizarCosto(id: number, input: ActualizarCostoInput) {
  const costo = await prisma.costo.findUnique({ where: { id }, select: { id: true } });
  if (!costo) {
    throw new NotFoundError("Costo");
  }
  return prisma.costo.update({
    where: { id },
    data: {
      ...(input.concepto !== undefined ? { concepto: input.concepto } : {}),
      ...(input.categoria !== undefined ? { categoria: input.categoria } : {}),
      ...(input.monto !== undefined ? { monto: input.monto } : {}),
      ...(input.periodo !== undefined ? { periodo: input.periodo } : {}),
      ...(input.vencimiento !== undefined
        ? { vencimiento: input.vencimiento ? new Date(`${input.vencimiento}T00:00:00`) : null }
        : {}),
      ...(input.estado !== undefined ? { estado: input.estado } : {}),
    },
    select: { id: true, concepto: true, estado: true },
  });
}

// --- Permisos ----------------------------------------------------------------

export async function listarPermisos(query: { estado?: string }) {
  const permisos = await prisma.permiso.findMany({
    where: query.estado ? { estado: query.estado as never } : {},
    orderBy: { vencimiento: "asc" },
  });

  const hoy = new Date();
  return permisos.map((permiso) => ({
    id: permiso.id,
    nombre: permiso.nombre,
    entidad: permiso.entidad,
    numero: permiso.numero,
    vencimiento: toDateOnly(permiso.vencimiento),
    estado: permiso.estado,
    // Un permiso vigente pero próximo a vencer merece atención en la interfaz.
    vencePronto:
      permiso.estado === "vigente" &&
      permiso.vencimiento.getTime() - hoy.getTime() < 30 * 24 * 3_600_000,
  }));
}

export async function crearPermiso(input: CrearPermisoInput) {
  return prisma.permiso.create({
    data: {
      nombre: input.nombre,
      entidad: input.entidad,
      numero: input.numero ?? null,
      vencimiento: new Date(`${input.vencimiento}T00:00:00`),
      estado: "vigente",
    },
    select: { id: true, nombre: true, vencimiento: true },
  });
}
