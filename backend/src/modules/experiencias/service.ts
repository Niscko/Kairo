import { ConflictError, NotFoundError, ValidationError } from "../../lib/errors.js";
import { validarHorario } from "../../lib/horarios.js";
import { prisma } from "../../lib/prisma.js";
import {
  formatDateTimeLocal,
  parseDateTimeLocal,
  type CrearExperienciaInput,
  type ListarExperienciasQuery,
} from "./schema.js";

export interface ExperienciaDTO {
  id: number;
  nombre: string;
  descripcion: string | null;
  espacio: string;
  inicio: string;
  fin: string;
  capacidad: number;
  precio: number;
  estado: string;
  participantes: number;
  empleados: string[];
  equipos: string[];
  productos: Array<{ producto: string; cantidad: number }>;
}

export async function listar(query: ListarExperienciasQuery): Promise<ExperienciaDTO[]> {
  const experiencias = await prisma.experiencia.findMany({
    where: {
      ...(query.estado ? { estado: query.estado } : {}),
      ...(query.upcoming ? { fin: { gte: new Date() } } : {}),
    },
    include: {
      espacio: { select: { nombre: true } },
      empleados: { include: { empleado: { include: { usuario: { select: { nombre: true } } } } } },
      equipos: { include: { equipo: { select: { nombre: true } } } },
      productos: { include: { producto: { select: { nombre: true } } } },
      _count: { select: { participantes: true } },
    },
    orderBy: { inicio: "asc" },
  });

  return experiencias.map((experiencia) => ({
    id: experiencia.id,
    nombre: experiencia.nombre,
    descripcion: experiencia.descripcion,
    espacio: experiencia.espacio.nombre,
    inicio: formatDateTimeLocal(experiencia.inicio),
    fin: formatDateTimeLocal(experiencia.fin),
    capacidad: experiencia.capacidad,
    precio: experiencia.precio,
    estado: experiencia.estado,
    participantes: experiencia._count.participantes,
    empleados: experiencia.empleados.map((e) => e.empleado.usuario.nombre),
    equipos: experiencia.equipos.map((e) => e.equipo.nombre),
    productos: experiencia.productos.map((p) => ({
      producto: p.producto.nombre,
      cantidad: p.cantidad,
    })),
  }));
}

/**
 * Crea una experiencia y la reserva que sostiene su espacio.
 *
 * Todo en una transacción: o se crea la experiencia con su reserva y sus
 * asignaciones, o no queda nada a medias. La reserva se crea con proposito
 * "evento", que no se cobra por hora de espacio.
 */
export async function crear(input: CrearExperienciaInput): Promise<{ id: number }> {
  const inicio = parseDateTimeLocal(input.inicio);
  const fin = parseDateTimeLocal(input.fin);
  if (!inicio || !fin) {
    throw new ValidationError("Indica fecha y hora de inicio y de fin");
  }
  validarHorario(inicio, fin);

  const espacio = await prisma.espacio.findUnique({ where: { id: input.espacioId } });
  if (!espacio) {
    throw new NotFoundError("Espacio");
  }
  if (espacio.estado === "mantenimiento") {
    throw new ConflictError("Ese espacio está en mantenimiento");
  }
  if (input.capacidad > espacio.capacidad) {
    throw new ConflictError(`La capacidad supera la del espacio (${espacio.capacidad})`);
  }

  // El espacio no puede estar reservado en ese tramo.
  const reservaCruzada = await prisma.reserva.findFirst({
    where: {
      espacioId: espacio.id,
      estado: { not: "cancelada" },
      inicio: { lt: fin },
      fin: { gt: inicio },
    },
    select: { id: true },
  });
  if (reservaCruzada) {
    throw new ConflictError("Ese espacio ya está reservado en ese horario");
  }

  await verificarEmpleados(input.empleados, inicio, fin);
  await verificarEquipos(input.equipos, inicio, fin);
  await verificarProductos(input.productos);

  const ahora = new Date();
  const enCurso = inicio <= ahora && fin > ahora;

  return prisma.$transaction(async (tx) => {
    const reserva = await tx.reserva.create({
      data: {
        espacioId: espacio.id,
        clienteId: null,
        inicio,
        fin,
        proposito: "evento",
        estado: enCurso ? "en_curso" : "confirmada",
        monto: 0,
        notas: `Experiencia: ${input.nombre}`,
      },
      select: { id: true },
    });

    const experiencia = await tx.experiencia.create({
      data: {
        nombre: input.nombre,
        descripcion: input.descripcion && input.descripcion.length > 0 ? input.descripcion : null,
        espacioId: espacio.id,
        reservaId: reserva.id,
        inicio,
        fin,
        capacidad: input.capacidad,
        precio: input.precio,
        estado: enCurso ? "en_curso" : "programada",
      },
      select: { id: true },
    });

    for (const empleadoId of new Set(input.empleados)) {
      await tx.experienciaEmpleado.create({ data: { experienciaId: experiencia.id, empleadoId } });
    }
    for (const equipoId of new Set(input.equipos)) {
      await tx.experienciaEquipo.create({ data: { experienciaId: experiencia.id, equipoId } });
    }
    for (const item of input.productos) {
      await tx.experienciaProducto.create({
        data: { experienciaId: experiencia.id, productoId: item.productoId, cantidad: item.cantidad },
      });
    }

    return { id: experiencia.id };
  });
}

/** El personal no puede estar en dos experiencias a la vez. */
async function verificarEmpleados(empleadoIds: number[], inicio: Date, fin: Date): Promise<void> {
  for (const empleadoId of new Set(empleadoIds)) {
    const empleado = await prisma.empleado.findFirst({
      where: { id: empleadoId, activo: true, usuario: { activo: true } },
      select: { id: true },
    });
    if (!empleado) {
      throw new ConflictError("Hay un empleado que no está activo");
    }

    const cruce = await prisma.experienciaEmpleado.findFirst({
      where: {
        empleadoId,
        experiencia: { estado: { not: "cancelada" }, inicio: { lt: fin }, fin: { gt: inicio } },
      },
      include: { experiencia: { select: { nombre: true } } },
    });
    if (cruce) {
      throw new ConflictError(
        `Esa persona ya está asignada a «${cruce.experiencia.nombre}» en ese horario`,
      );
    }
  }
}

/** El equipo debe estar operativo y libre en ese horario. */
async function verificarEquipos(equipoIds: number[], inicio: Date, fin: Date): Promise<void> {
  for (const equipoId of new Set(equipoIds)) {
    const equipo = await prisma.equipo.findUnique({
      where: { id: equipoId },
      select: { id: true, nombre: true, estado: true },
    });
    if (!equipo) {
      throw new NotFoundError("Equipo");
    }
    if (equipo.estado !== "operativo") {
      throw new ConflictError(`${equipo.nombre} no está operativo`);
    }

    const cruce = await prisma.experienciaEquipo.findFirst({
      where: {
        equipoId,
        experiencia: { estado: { not: "cancelada" }, inicio: { lt: fin }, fin: { gt: inicio } },
      },
      include: { experiencia: { select: { nombre: true } } },
    });
    if (cruce) {
      throw new ConflictError(`${equipo.nombre} ya está comprometido en «${cruce.experiencia.nombre}»`);
    }
  }
}

async function verificarProductos(productos: Array<{ productoId: number; cantidad: number }>): Promise<void> {
  if (productos.length === 0) return;
  const ids = [...new Set(productos.map((p) => p.productoId))];
  const validos = await prisma.producto.findMany({
    where: { id: { in: ids }, activo: true },
    select: { id: true },
  });
  if (validos.length !== ids.length) {
    throw new ConflictError("Hay un producto que ya no está disponible");
  }
}

/** Inscribe a un cliente en una experiencia, si queda cupo. */
export async function agregarParticipante(
  experienciaId: number,
  clienteId: number,
): Promise<{ id: number }> {
  const experiencia = await prisma.experiencia.findUnique({
    where: { id: experienciaId },
    select: { id: true, capacidad: true, estado: true, _count: { select: { participantes: true } } },
  });
  if (!experiencia) {
    throw new NotFoundError("Experiencia");
  }
  if (experiencia.estado === "cancelada" || experiencia.estado === "finalizada") {
    throw new ConflictError("Esa experiencia ya no admite participantes");
  }
  if (experiencia._count.participantes >= experiencia.capacidad) {
    throw new ConflictError("La experiencia está al completo");
  }

  const cliente = await prisma.cliente.findFirst({
    where: { id: clienteId, usuario: { activo: true } },
    select: { id: true },
  });
  if (!cliente) {
    throw new NotFoundError("Cliente");
  }

  const existente = await prisma.experienciaParticipante.findUnique({
    where: { experienciaId_clienteId: { experienciaId, clienteId } },
    // Clave compuesta: no hay columna id.
    select: { clienteId: true },
  });
  if (existente) {
    throw new ConflictError("Ese cliente ya está inscrito");
  }

  const participante = await prisma.experienciaParticipante.create({
    data: { experienciaId, clienteId },
    // La tabla tiene clave compuesta (experiencia_id, cliente_id): no hay id.
    select: { clienteId: true },
  });
  return { id: participante.clienteId };
}

/** Cancela una experiencia y libera el espacio que tenía reservado. */
export async function cancelar(experienciaId: number): Promise<void> {
  const experiencia = await prisma.experiencia.findUnique({
    where: { id: experienciaId },
    select: { id: true, estado: true, reservaId: true },
  });
  if (!experiencia) {
    throw new NotFoundError("Experiencia");
  }
  if (experiencia.estado === "cancelada") {
    throw new ConflictError("Esa experiencia ya está cancelada");
  }

  await prisma.$transaction(async (tx) => {
    await tx.experiencia.update({ where: { id: experienciaId }, data: { estado: "cancelada" } });
    if (experiencia.reservaId) {
      await tx.reserva.update({
        where: { id: experiencia.reservaId },
        data: { estado: "cancelada" },
      });
    }
  });
}

/** Cierra una experiencia: termina la reserva que la sostenía. */
export async function cerrar(experienciaId: number): Promise<void> {
  const experiencia = await prisma.experiencia.findUnique({
    where: { id: experienciaId },
    select: { id: true, estado: true, reservaId: true },
  });
  if (!experiencia) {
    throw new NotFoundError("Experiencia");
  }
  if (experiencia.estado === "cancelada") {
    throw new ConflictError("Esa experiencia está cancelada");
  }
  if (experiencia.estado === "finalizada") {
    throw new ConflictError("Esa experiencia ya está finalizada");
  }

  await prisma.$transaction(async (tx) => {
    await tx.experiencia.update({ where: { id: experienciaId }, data: { estado: "finalizada" } });
    if (experiencia.reservaId) {
      await tx.reserva.update({
        where: { id: experiencia.reservaId },
        data: { estado: "completada" },
      });
    }
  });
}
