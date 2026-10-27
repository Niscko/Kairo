import { ConflictError, NotFoundError, ValidationError } from "../../lib/errors.js";
import { diaUTC, fechaISO } from "../../lib/fechas.js";
import { esHoraValida, horaEsAnterior } from "../../lib/horarios.js";
import { prisma } from "../../lib/prisma.js";
import type { CrearTurnoInput, ListarTurnosQuery } from "./schema.js";

export interface TurnoDTO {
  id: number;
  empleadoId: number;
  nombre: string;
  cargo: string;
  fecha: string;
  horaInicio: string;
  horaFin: string;
  area: string;
}

export interface EmpleadoDTO {
  id: number;
  nombre: string;
  email: string;
  telefono: string | null;
  cargo: string;
  fechaIngreso: string;
  /** El salario solo se muestra a la dirección. */
  salario?: number;
}

export async function listarTurnos(query: ListarTurnosQuery): Promise<{ fecha: string; turnos: TurnoDTO[] }> {
  const fecha = query.fecha ?? fechaISO(new Date());
  const turnos = await prisma.turno.findMany({
    where: {
      fecha: dayStart(fecha),
      ...(query.empleadoId ? { empleadoId: query.empleadoId } : {}),
    },
    include: {
      empleado: { include: { usuario: { select: { nombre: true } } } },
    },
    orderBy: { horaInicio: "asc" },
  });

  return {
    fecha,
    turnos: turnos.map((turno) => ({
      id: turno.id,
      empleadoId: turno.empleadoId,
      nombre: turno.empleado.usuario.nombre,
      cargo: turno.empleado.cargo,
      fecha,
      horaInicio: turno.horaInicio,
      horaFin: turno.horaFin,
      area: turno.area,
    })),
  };
}

export async function crearTurno(input: CrearTurnoInput): Promise<{ id: number }> {
  if (!esHoraValida(input.horaInicio) || !esHoraValida(input.horaFin)) {
    throw new ValidationError("Las horas deben tener el formato HH:MM");
  }
  if (!horaEsAnterior(input.horaInicio, input.horaFin)) {
    throw new ValidationError("La hora de fin debe ser posterior a la de inicio");
  }

  const empleado = await prisma.empleado.findFirst({
    where: { id: input.empleadoId, activo: true, usuario: { activo: true } },
    select: { id: true },
  });
  if (!empleado) {
    throw new NotFoundError("Empleado");
  }

  // Una persona no puede tener dos turnos que se pisen el mismo día.
  const cruce = await prisma.turno.findFirst({
    where: {
      empleadoId: input.empleadoId,
      fecha: dayStart(input.fecha),
      horaInicio: { lt: input.horaFin },
      horaFin: { gt: input.horaInicio },
    },
    select: { id: true },
  });
  if (cruce) {
    throw new ConflictError("Esa persona ya tiene un turno cruzado ese día");
  }

  const turno = await prisma.turno.create({
    data: {
      empleadoId: input.empleadoId,
      fecha: dayStart(input.fecha),
      horaInicio: input.horaInicio,
      horaFin: input.horaFin,
      area: input.area,
    },
    select: { id: true },
  });

  return { id: turno.id };
}

/**
 * Lista el personal. El salario es información sensible: solo la dirección lo
 * ve, así que se omite del payload para los demás roles.
 */
export async function listarEmpleados(
  query: { q?: string },
  esAdmin: boolean,
): Promise<EmpleadoDTO[]> {
  const empleados = await prisma.empleado.findMany({
    where: {
      activo: true,
      usuario: { activo: true },
      ...(query.q
        ? {
            OR: [
              { usuario: { nombre: { contains: query.q, mode: "insensitive" } } },
              { usuario: { email: { contains: query.q, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    include: { usuario: { select: { nombre: true, email: true, telefono: true } } },
    orderBy: { usuario: { nombre: "asc" } },
  });

  return empleados.map((empleado) => ({
    id: empleado.id,
    nombre: empleado.usuario.nombre,
    email: empleado.usuario.email,
    telefono: empleado.usuario.telefono,
    cargo: empleado.cargo,
    fechaIngreso: fechaISO(empleado.fechaIngreso),
    ...(esAdmin ? { salario: empleado.salario } : {}),
  }));
}

/**
 * Inicio del día para comparar contra la fecha de un turno.
 *
 * Un turno es un día sin hora: se almacena en UTC a medianoche para que el
 * valor sea el mismo sin importar la zona horaria del proceso que lo lea o
 * lo escriba. La zona del negocio solo afecta a la presentación.
 */
function dayStart(fecha: string): Date {
  return diaUTC(fecha);
}
