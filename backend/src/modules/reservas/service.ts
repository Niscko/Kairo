import { type Prisma, type PropositoReserva } from "@prisma/client";

import type { Identidad } from "../../lib/clientes.js";
import { dateISO, estadoPorHorario, montoReserva, overlaps } from "../../lib/domain.js";
import { ConflictError, NotFoundError, ValidationError } from "../../lib/errors.js";
import { validarHorario } from "../../lib/horarios.js";
import { prisma } from "../../lib/prisma.js";
import {
  formatDateTimeLocal,
  parseDateTimeLocal,
  type CrearReservaInput,
  type ListarReservasQuery,
} from "./schema.js";

export interface ReservaDTO {
  id: number;
  espacioId: number;
  espacio: string;
  espacioTipo: string;
  clienteId: number | null;
  cliente: string | null;
  inicio: string;
  fin: string;
  proposito: string;
  estado: string;
  monto: number;
  notas: string | null;
}

/** Un espacio no puede tener dos reservas activas en el mismo horario. */
async function hayReservaCruzada(
  espacioId: number,
  inicio: Date,
  fin: Date,
  excluirId?: number,
): Promise<boolean> {
  const cruce = await prisma.reserva.findFirst({
    where: {
      espacioId,
      estado: { not: "cancelada" },
      inicio: { lt: fin },
      fin: { gt: inicio },
      ...(excluirId ? { NOT: { id: excluirId } } : {}),
    },
    select: { id: true },
  });
  return cruce !== null;
}

/**
 * Lista las reservas de un día. Un cliente solo ve las suyas; el personal ve
 * todas las del local.
 */
export async function listar(
  query: ListarReservasQuery,
  identidad: Identidad,
): Promise<{ dia: string; reservas: ReservaDTO[] }> {
  const dia = query.dia ?? dateISO(new Date());
  const inicioDia = parseDateTimeLocal(`${dia} 00:00`);
  const finDia = parseDateTimeLocal(`${dia} 00:00`);
  if (!inicioDia || !finDia) {
    throw new ValidationError("La fecha indicada no es válida");
  }

  const [year, month, day] = dia.split("-").map(Number);
  const fin = new Date(year ?? 0, (month ?? 1) - 1, (day ?? 1) + 1, 0, 0, 0, 0);

  const reservas = await prisma.reserva.findMany({
    where: {
      inicio: { lt: fin },
      fin: { gt: inicioDia },
      ...(query.espacioId ? { espacioId: query.espacioId } : {}),
      ...(query.estado ? { estado: query.estado } : {}),
      ...(identidad.rol === "cliente" ? { clienteId: identidad.clienteId! } : {}),
    },
    include: {
      espacio: { select: { nombre: true, tipo: true } },
      cliente: { select: { usuario: { select: { nombre: true } } } },
    },
    orderBy: { inicio: "asc" },
  });

  return {
    dia,
    reservas: reservas.map((reserva) => ({
      id: reserva.id,
      espacioId: reserva.espacioId,
      espacio: reserva.espacio.nombre,
      espacioTipo: reserva.espacio.tipo,
      clienteId: reserva.clienteId,
      cliente: reserva.cliente?.usuario.nombre ?? null,
      inicio: formatDateTimeLocal(reserva.inicio),
      fin: formatDateTimeLocal(reserva.fin),
      proposito: reserva.proposito,
      estado: reserva.estado,
      monto: reserva.monto,
      notas: reserva.notas,
    })),
  };
}

export async function crear(
  input: CrearReservaInput,
  identidad: Identidad,
): Promise<{ id: number; monto: number; incluido: boolean }> {
  const inicio = parseDateTimeLocal(input.inicio);
  const fin = parseDateTimeLocal(input.fin);
  if (!inicio || !fin) {
    throw new ValidationError("Indica fecha y hora de inicio y de fin");
  }

  validarHorario(inicio, fin);

  // No se reserva en el pasado: una reserva vencida no se puede usar ni
  // facturar, así que no tiene sentido crearla.
  if (fin <= new Date()) {
    throw new ValidationError("No se pueden crear reservas en el pasado");
  }

  // Un cliente reserva siempre para sí mismo; el personal puede reservar para
  // cualquier cliente del local.
  const clienteId = identidad.rol === "cliente" ? identidad.clienteId! : (input.clienteId ?? null);
  if (!clienteId) {
    throw new ValidationError("Selecciona el cliente de la reserva");
  }

  const espacio = await prisma.espacio.findUnique({ where: { id: input.espacioId } });
  if (!espacio) {
    throw new NotFoundError("Espacio");
  }
  if (espacio.estado === "mantenimiento") {
    throw new ConflictError("Ese espacio está en mantenimiento");
  }

  const cliente = await prisma.cliente.findUnique({
    where: { id: clienteId },
    include: { usuario: { select: { activo: true } } },
  });
  if (!cliente || !cliente.usuario.activo) {
    throw new NotFoundError("Cliente");
  }

  if (await hayReservaCruzada(espacio.id, inicio, fin)) {
    throw new ConflictError("Ese espacio ya está reservado en ese horario");
  }

  const monto = montoReserva({
    hours: (fin.getTime() - inicio.getTime()) / 3_600_000,
    tarifaHora: espacio.tarifaHora,
    tipo: espacio.tipo,
    membresia: cliente.membresia,
    membresiaVence: cliente.membresiaVence,
    day: dateISO(inicio),
    proposito: input.proposito,
  });

  const ahora = new Date();
  // El estado se deriva del horario: una reserva que ya terminó está
  // `completada` y cuenta como ingreso realizado, no como previsto.
  const estado = estadoPorHorario(inicio, fin, ahora);

  const reserva = await prisma.reserva.create({
    data: {
      espacioId: espacio.id,
      clienteId: cliente.id,
      inicio,
      fin,
      proposito: input.proposito as PropositoReserva,
      estado,
      monto,
      notas: input.notas && input.notas.length > 0 ? input.notas : null,
    },
    select: { id: true },
  });

  return {
    id: reserva.id,
    monto,
    // La reserva queda cubierta por la membresía del cliente.
    incluido: monto === 0 && espacio.tipo === "puesto",
  };
}

/** Cancela una reserva. Solo el personal o el propio cliente pueden hacerlo. */
export async function cancelar(id: number, identidad: Identidad): Promise<void> {
  const reserva = await prisma.reserva.findUnique({
    where: { id },
    select: { id: true, clienteId: true, estado: true },
  });
  if (!reserva) {
    throw new NotFoundError("Reserva");
  }

  // Un cliente solo puede cancelar sus propias reservas. La comparación es
  // explícita por rol: un `null` no debe significar "sin restricciones".
  if (identidad.rol === "cliente" && reserva.clienteId !== identidad.clienteId) {
    throw new NotFoundError("Reserva");
  }
  if (reserva.estado === "completada" || reserva.estado === "cancelada") {
    throw new ConflictError("Esa reserva ya no se puede cancelar");
  }

  // Una reserva que sostiene una experiencia activa no se cancela por separado:
  // hay que cancelar la experiencia, que es la que libera el espacio.
  const experiencia = await prisma.experiencia.findFirst({
    where: { reservaId: id, estado: { not: "cancelada" } },
    select: { id: true },
  });
  if (experiencia) {
    throw new ConflictError("Esta reserva pertenece a una experiencia. Cancela la experiencia.");
  }

  await prisma.reserva.update({ where: { id }, data: { estado: "cancelada" } });
}

/**
 * Estado efectivo de una reserva, derivado de su horario.
 *
 * La columna `estado` en la base se actualiza por barridos, pero leer el
 * horario es siempre más fiable: si el barrido se retrasa, el reporte no
 * clasifica como "prevista" una reserva que ya se usó. Una reserva cancelada
 * conserva su estado, porque esa decisión es explícita.
 */
export function estadoEfectivo(
  reserva: { estado: string; inicio: Date; fin: Date },
  ahora: Date = new Date(),
): string {
  if (reserva.estado === "cancelada") return "cancelada";
  return estadoPorHorario(reserva.inicio, reserva.fin, ahora);
}

/**
 * Marca como completadas las reservas cuya hora de fin ya pasó.
 *
 * Es idempotente y segura de ejecutar en cada lectura: solo toca las
 * reservas `confirmada` o `en_curso` que ya terminaron.
 */
export async function completarReservasVencidas(): Promise<number> {
  const resultado = await prisma.reserva.updateMany({
    where: {
      estado: { in: ["confirmada", "en_curso"] },
      fin: { lte: new Date() },
    },
    data: { estado: "completada" },
  });
  return resultado.count;
}

/** Detecta solapamientos en un conjunto de reservas; lo usan los reportes. */
export function detectarSolapamientos(
  reservas: Array<{ id: number; espacioId: number; inicio: Date; fin: Date }>,
): number[] {
  const porEspacio = new Map<number, typeof reservas>();
  for (const reserva of reservas) {
    const lista = porEspacio.get(reserva.espacioId) ?? [];
    lista.push(reserva);
    porEspacio.set(reserva.espacioId, lista);
  }

  const solapadas: number[] = [];
  for (const lista of porEspacio.values()) {
    for (let i = 0; i < lista.length; i += 1) {
      for (let j = i + 1; j < lista.length; j += 1) {
        const a = lista[i];
        const b = lista[j];
        if (a && b && overlaps(a.inicio, a.fin, b.inicio, b.fin)) {
          solapadas.push(a.id, b.id);
        }
      }
    }
  }
  return solapadas;
}

export type { Prisma };
