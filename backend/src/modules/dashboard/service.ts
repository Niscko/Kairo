import { addDays, dateISO, dayStamp } from "../../lib/domain.js";
import { diaUTC } from "../../lib/fechas.js";
import { prisma } from "../../lib/prisma.js";
import { formatDateTimeLocal } from "../reservas/schema.js";
import type { DashboardQuery } from "./schema.js";

export interface DashboardDTO {
  rol: string;
  ahora: string;
  espacios: Array<{
    id: number;
    nombre: string;
    tipo: string;
    zona: string;
    estado: string;
    presencia: "ocupado" | "libre";
    proximoFin: string | null;
  }>;
  ocupados: number;
  ventasHoy: { total: number; operaciones: number };
  reservas: Array<{
    id: number;
    espacio: string;
    cliente: string | null;
    inicio: string;
    fin: string;
    estado: string;
  }>;
  stock: Array<{ id: number; nombre: string; unidad: string; stock: number; stockMinimo: number }>;
  permisos: Array<{ id: number; nombre: string; entidad: string; vencimiento: string; estado: string }>;
  turnos: Array<{ id: number; nombre: string; cargo: string; horaInicio: string; horaFin: string; area: string }>;
  experiencias: Array<{ id: number; nombre: string; inicio: string; fin: string; estado: string; participantes: number }>;
  serie: Array<{ dia: string; total: number }>;
  consumoMes?: number;
  costosPendientes?: Array<{ id: number; concepto: string; monto: number; vencimiento: string | null }>;
  costosPendientesTotal?: number;
}

/**
 * Presencia de cada espacio: ocupado si hay una reserva en curso ahora mismo.
 * La comparación se hace en SQL para no traer todas las reservas del día.
 */
async function presenciaEspacios(ahora: Date) {
  const espacios = await prisma.espacio.findMany({
    where: { estado: { not: "mantenimiento" } },
    orderBy: [{ zona: "asc" }, { nombre: "asc" }],
  });

  const occupied = await prisma.reserva.findMany({
    where: {
      estado: { in: ["confirmada", "en_curso"] },
      inicio: { lte: ahora },
      fin: { gt: ahora },
    },
    select: { espacioId: true, fin: true },
  });

  const porEspacio = new Map(occupied.map((r) => [r.espacioId, r.fin]));

  return espacios.map((espacio) => {
    const fin = porEspacio.get(espacio.id) ?? null;
    return {
      id: espacio.id,
      nombre: espacio.nombre,
      tipo: espacio.tipo,
      zona: espacio.zona,
      estado: espacio.estado,
      presencia: fin ? ("ocupado" as const) : ("libre" as const),
      proximoFin: fin ? formatDateTimeLocal(fin) : null,
    };
  });
}

export async function construir(
  query: DashboardQuery,
  contexto: { rol: string; clienteId: number | null },
): Promise<DashboardDTO> {
  const ahora = new Date();

  const [espacios, ventasHoy, stock, permisos, turnos] = await Promise.all([
    presenciaEspacios(ahora),
    prisma.venta.aggregate({
      where: { fecha: { gte: dayStamp(ahora, "00:00"), lt: dayStamp(addDays(ahora, 1), "00:00") } },
      _sum: { total: true },
      _count: { _all: true },
    }),
    prisma.insumo.findMany({
      where: { stock: { lte: prisma.insumo.fields.stockMinimo } },
      select: { id: true, nombre: true, unidad: true, stock: true, stockMinimo: true },
      orderBy: { nombre: "asc" },
    }),
    prisma.permiso.findMany({
      where: {
        OR: [
          { estado: "vencido" },
          { vencimiento: { lte: addDays(ahora, 45) } },
        ],
      },
      orderBy: { vencimiento: "asc" },
    }),
    prisma.turno.findMany({
      // Los turnos se guardan en UTC a medianoche: el filtro usa la misma
      // referencia para no caer en el día anterior.
      where: { fecha: diaUTC(dateISO(ahora)) },
      include: { empleado: { include: { usuario: { select: { nombre: true } } } } },
      orderBy: [{ horaInicio: "asc" }, { empleado: { usuario: { nombre: "asc" } } }],
    }),
  ]);

  const payload: DashboardDTO = {
    rol: contexto.rol,
    ahora: formatDateTimeLocal(ahora),
    espacios,
    ocupados: espacios.filter((e) => e.presencia === "ocupado").length,
    ventasHoy: {
      total: ventasHoy._sum.total ?? 0,
      operaciones: ventasHoy._count._all,
    },
    reservas: [],
    stock: stock.map((insumo) => ({
      id: insumo.id,
      nombre: insumo.nombre,
      unidad: insumo.unidad,
      stock: insumo.stock,
      stockMinimo: insumo.stockMinimo,
    })),
    permisos: permisos.map((permiso) => ({
      id: permiso.id,
      nombre: permiso.nombre,
      entidad: permiso.entidad,
      vencimiento: dateISO(permiso.vencimiento),
      estado: permiso.estado,
    })),
    turnos: turnos.map((turno) => ({
      id: turno.id,
      nombre: turno.empleado.usuario.nombre,
      cargo: turno.empleado.cargo,
      horaInicio: turno.horaInicio,
      horaFin: turno.horaFin,
      area: turno.area,
    })),
    experiencias: [],
    serie: [],
  };

  const experiencias = await prisma.experiencia.findMany({
    where: { estado: { not: "cancelada" }, fin: { gte: ahora } },
    include: { _count: { select: { participantes: true } } },
    orderBy: { inicio: "asc" },
    take: 4,
  });
  payload.experiencias = experiencias.map((experiencia) => ({
    id: experiencia.id,
    nombre: experiencia.nombre,
    inicio: formatDateTimeLocal(experiencia.inicio),
    fin: formatDateTimeLocal(experiencia.fin),
    estado: experiencia.estado,
    participantes: experiencia._count.participantes,
  }));

  // Un cliente ve su propia agenda; el personal ve la del local.
  const reservas = await prisma.reserva.findMany({
    where: {
      estado: { not: "cancelada" },
      fin: { gte: ahora },
      ...(contexto.clienteId !== null ? { clienteId: contexto.clienteId } : {}),
    },
    include: {
      espacio: { select: { nombre: true } },
      cliente: { include: { usuario: { select: { nombre: true } } } },
    },
    orderBy: { inicio: "asc" },
    take: 8,
  });
  payload.reservas = reservas.map((reserva) => ({
    id: reserva.id,
    espacio: reserva.espacio.nombre,
    cliente: reserva.cliente?.usuario.nombre ?? null,
    inicio: formatDateTimeLocal(reserva.inicio),
    fin: formatDateTimeLocal(reserva.fin),
    estado: reserva.estado,
  }));

  if (contexto.rol === "cliente") {
    const consumo = await prisma.venta.aggregate({
      where: {
        clienteId: contexto.clienteId ?? -1,
        fecha: {
          gte: dayStamp(new Date(ahora.getFullYear(), ahora.getMonth(), 1), "00:00"),
          lt: dayStamp(new Date(ahora.getFullYear(), ahora.getMonth() + 1, 1), "00:00"),
        },
      },
      _sum: { total: true },
    });
    payload.consumoMes = consumo._sum.total ?? 0;
    return payload;
  }

  // Serie de ventas de los últimos N días, agrupada en SQL.
  const desde = dayStamp(addDays(ahora, -(query.dias - 1)), "00:00");
  const serie = await prisma.venta.groupBy({
    by: ["fecha"],
    where: { fecha: { gte: desde } },
    _sum: { total: true },
  });

  const porDia = new Map<string, number>();
  for (const fila of serie) {
    porDia.set(dateISO(fila.fecha), fila._sum.total ?? 0);
  }
  payload.serie = [];
  for (let offset = query.dias - 1; offset >= 0; offset -= 1) {
    const dia = dateISO(addDays(ahora, -offset));
    payload.serie.push({ dia, total: porDia.get(dia) ?? 0 });
  }

  if (contexto.rol === "admin") {
    const periodo = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}`;
    const costos = await prisma.costo.findMany({
      where: { periodo, estado: "pendiente" },
      orderBy: { monto: "desc" },
    });
    payload.costosPendientes = costos.map((costo) => ({
      id: costo.id,
      concepto: costo.concepto,
      monto: costo.monto,
      vencimiento: costo.vencimiento ? dateISO(costo.vencimiento) : null,
    }));
    payload.costosPendientesTotal = costos.reduce((suma, costo) => suma + costo.monto, 0);
  }

  return payload;
}
