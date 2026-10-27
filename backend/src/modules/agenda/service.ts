import { dateISO } from "../../lib/domain.js";
import { prisma } from "../../lib/prisma.js";
import { formatDateTimeLocal } from "../reservas/schema.js";
import type { AgendaQuery } from "./schema.js";

export interface AgendaDTO {
  dia: string;
  /** Reservas del día, con el espacio y el cliente. */
  reservas: Array<{
    id: number;
    espacio: string;
    espacioTipo: string;
    cliente: string | null;
    inicio: string;
    fin: string;
    proposito: string;
    estado: string;
    monto: number;
  }>;
  /** Turnos del personal ese día. */
  turnos: Array<{
    id: number;
    nombre: string;
    cargo: string;
    horaInicio: string;
    horaFin: string;
    area: string;
  }>;
  /** Experiencias que empiezan o continúan ese día. */
  experiencias: Array<{
    id: number;
    nombre: string;
    espacio: string;
    inicio: string;
    fin: string;
    estado: string;
    participantes: number;
    capacidad: number;
  }>;
  /** Espacios ocupados en el momento consultado. */
  ocupacion: Array<{
    id: number;
    nombre: string;
    tipo: string;
    zona: string;
    presencia: "ocupado" | "libre";
    hasta: string | null;
  }>;
  /** Horas reservadas por espacio, para la barra de ocupación. */
  horasPorEspacio: Array<{ id: number; nombre: string; horas: number }>;
}

/**
 * Agenda de un día: reservas, turnos, experiencias y ocupación.
 *
 * Es la vista de "qué está pasando hoy en el local", para el personal y para
 * el cliente (que solo ve sus propias reservas).
 */
export async function construir(
  query: AgendaQuery,
  contexto: { clienteId: number | null },
): Promise<AgendaDTO> {
  const dia = query.dia ?? dateISO(new Date());
  const [year, month, day] = dia.split("-").map(Number);
  // Los turnos se almacenan en UTC a medianoche (un día sin hora), así que el
  // filtro debe usar la misma referencia. Con hora local, el filtro caería en
  // el día anterior: en Bogotá, el 27 a las 00:00 local es el 26 a las 05:00
  // en UTC.
  const inicio = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1, 0, 0, 0, 0));
  const fin = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, (day ?? 1) + 1, 0, 0, 0, 0));
  const ahora = new Date();

  const [reservas, turnos, experiencias, espacios] = await Promise.all([
    prisma.reserva.findMany({
      where: {
        inicio: { lt: fin },
        fin: { gt: inicio },
        ...(contexto.clienteId !== null ? { clienteId: contexto.clienteId } : {}),
      },
      include: {
        espacio: { select: { nombre: true, tipo: true } },
        cliente: { include: { usuario: { select: { nombre: true } } } },
      },
      orderBy: { inicio: "asc" },
    }),
    prisma.turno.findMany({
      where: { fecha: inicio },
      include: { empleado: { include: { usuario: { select: { nombre: true } } } } },
      orderBy: [{ horaInicio: "asc" }],
    }),
    prisma.experiencia.findMany({
      where: {
        inicio: { lt: fin },
        fin: { gt: inicio },
        estado: { not: "cancelada" },
      },
      include: {
        espacio: { select: { nombre: true } },
        _count: { select: { participantes: true } },
      },
      orderBy: { inicio: "asc" },
    }),
    prisma.espacio.findMany({
      where: { estado: { not: "mantenimiento" } },
      orderBy: [{ zona: "asc" }, { nombre: "asc" }],
    }),
  ]);

  // Qué espacios están ocupados en este momento.
  const ocupadas = await prisma.reserva.findMany({
    where: {
      estado: { in: ["confirmada", "en_curso"] },
      inicio: { lte: ahora },
      fin: { gt: ahora },
    },
    select: { espacioId: true, fin: true },
  });
  const hastaPorEspacio = new Map(ocupadas.map((r) => [r.espacioId, r.fin]));

  // Horas reservadas por espacio dentro del día, recortadas a sus límites.
  const horasPorEspacio = espacios.map((espacio) => {
    const horas = reservas
      .filter((reserva) => reserva.espacioId === espacio.id)
      .reduce((suma, reserva) => {
        const inicioReal = Math.max(reserva.inicio.getTime(), inicio.getTime());
        const finReal = Math.min(reserva.fin.getTime(), fin.getTime());
        return suma + Math.max(0, (finReal - inicioReal) / 3_600_000);
      }, 0);
    return { id: espacio.id, nombre: espacio.nombre, horas: Math.round(horas * 10) / 10 };
  });

  return {
    dia,
    reservas: reservas.map((reserva) => ({
      id: reserva.id,
      espacio: reserva.espacio.nombre,
      espacioTipo: reserva.espacio.tipo,
      cliente: reserva.cliente?.usuario.nombre ?? null,
      inicio: formatDateTimeLocal(reserva.inicio),
      fin: formatDateTimeLocal(reserva.fin),
      proposito: reserva.proposito,
      estado: reserva.estado,
      monto: reserva.monto,
    })),
    turnos: turnos.map((turno) => ({
      id: turno.id,
      nombre: turno.empleado.usuario.nombre,
      cargo: turno.empleado.cargo,
      horaInicio: turno.horaInicio,
      horaFin: turno.horaFin,
      area: turno.area,
    })),
    experiencias: experiencias.map((experiencia) => ({
      id: experiencia.id,
      nombre: experiencia.nombre,
      espacio: experiencia.espacio.nombre,
      inicio: formatDateTimeLocal(experiencia.inicio),
      fin: formatDateTimeLocal(experiencia.fin),
      estado: experiencia.estado,
      participantes: experiencia._count.participantes,
      capacidad: experiencia.capacidad,
    })),
    ocupacion: espacios.map((espacio) => {
      const hasta = hastaPorEspacio.get(espacio.id) ?? null;
      return {
        id: espacio.id,
        nombre: espacio.nombre,
        tipo: espacio.tipo,
        zona: espacio.zona,
        presencia: hasta ? ("ocupado" as const) : ("libre" as const),
        hasta: hasta ? formatDateTimeLocal(hasta) : null,
      };
    }),
    horasPorEspacio,
  };
}
