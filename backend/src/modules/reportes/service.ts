import { type Prisma } from "@prisma/client";

import { addDays, dateISO, hoursBetween } from "../../lib/domain.js";
import { prisma } from "../../lib/prisma.js";
import {
  diasDelPeriodo,
  horasRecortadas,
  parseFecha,
  prorratear,
  resolverPeriodo,
  type Periodo,
} from "../../lib/periodos.js";
import { completarReservasVencidas, estadoEfectivo } from "../reservas/service.js";
import type { ReporteQuery } from "./schema.js";

/** Horas de atención al día: se usa como capacidad de un espacio. */
const HORAS_JORNADA = 16;

/** Franja horaria que se analiza en la curva de demanda: de 07:00 a 22:00. */
const HORA_INICIO = 7;
const HORA_FIN = 22;
/** Cuántas franjas cubre la curva (de 7 a 22, ambas incluidas). */
const FRANJAS_DEMANDA = HORA_FIN - HORA_INICIO + 1;

export interface ReporteDTO {
  rango: string;
  periodo: string;
  desde: string;
  hasta: string;
  ingresos: {
    ventas: number;
    reservasRealizadas: number;
    reservasPrevistas: number;
    experienciasRealizadas: number;
    experienciasPrevistas: number;
    total: number;
  };
  egresos: {
    fijos: number;
    insumos: number;
    experiencias: number;
    total: number;
    detalle: Array<{
      id: number;
      concepto: string;
      categoria: string;
      monto: number;
      periodo: string;
      estado: string;
      prorrateado: number;
    }>;
  };
  margenRealizado: number;
  ocupacionPromedio: number;
  utilizacion: Array<{
    id: number;
    nombre: string;
    tipo: string;
    horas: number;
    porcentaje: number;
  }>;
  demanda: Array<{ hora: number; reservas: number; ventas: number }>;
  flujo: Array<{ dia: string; ingresos: number; egresos: number }>;
  topProductos: Array<{ id: number; nombre: string; cantidad: number; ingresos: number }>;
  experiencias: Array<{
    id: number;
    nombre: string;
    estado: string;
    participantes: number;
    capacidad: number;
    ingresos: number;
    costoProductos: number;
    costoEspacio: number;
    margen: number;
  }>;
}

/**
 * Reporte de la operación.
 *
 * Las agregaciones se hacen en SQL (Prisma `groupBy`, `aggregate`) y solo el
 * prorrateo y los cruces se resuelven en memoria: son operaciones que dependen
 * de cada fila.
 */
export async function construir(query: ReporteQuery): Promise<ReporteDTO> {
  const periodo = resolverPeriodo({
    rango: query.rango,
    desde: query.desde,
    hasta: query.hasta,
  });

  const inicioRango = parseFecha(periodo.start.slice(0, 10))!;
  const finRango = parseFecha(periodo.end.slice(0, 10))!;
  const inicioDate = new Date(periodo.start.replace(" ", "T"));
  const finDate = new Date(periodo.end.replace(" ", "T"));

  // Las reservas que ya terminaron pasan a `completada` antes de medir. Es un
  // barrido idempotente: sin él, una reserva creada por la API se quedaría en
  // `confirmada` para siempre y el reporte la contaría como ingreso previsto.
  await completarReservasVencidas();

  const [ventas, reservas, experiences, itemsVendidos, espacios, costos, recetas] =
    await Promise.all([
      prisma.venta.aggregate({
        where: { fecha: { gte: inicioDate, lt: finDate } },
        _sum: { total: true },
      }),
      prisma.reserva.findMany({
        where: {
          proposito: { not: "evento" },
          estado: { not: "cancelada" },
          inicio: { lt: finDate },
          fin: { gt: inicioDate },
        },
        select: { id: true, monto: true, estado: true, inicio: true, fin: true, espacioId: true },
      }),
      prisma.experiencia.findMany({
        where: {
          estado: { not: "cancelada" },
          inicio: { lt: finDate },
          fin: { gt: inicioDate },
        },
        include: {
          espacio: { select: { nombre: true, tipo: true, tarifaHora: true } },
          participantes: { select: { clienteId: true } },
          productos: { include: { producto: { select: { id: true } } } },
        },
      }),
      prisma.ventaItem.findMany({
        where: { venta: { fecha: { gte: inicioDate, lt: finDate } } },
        select: {
          cantidad: true,
          precio: true,
          productoId: true,
          producto: { select: { nombre: true } },
          venta: { select: { fecha: true } },
        },
      }),
      prisma.espacio.findMany({ orderBy: { nombre: "asc" } }),
      prisma.costo.findMany({ orderBy: [{ categoria: "asc" }, { concepto: "asc" }] }),
      prisma.recetaItem.findMany({
        include: { insumo: { select: { costoUnitario: true, factorConversion: true } } },
      }),
    ]);

  // --- Ingresos por reservas ----------------------------------------------
  // El estado se deriva del horario, no solo de la columna: una reserva que
  // ya terminó es ingreso realizado aunque el barrido aún no la haya
  // marcado. Canceladas quedan fuera.
  const ahora = new Date();
  const realizadas = reservas.filter((reserva) => {
    const estado = estadoEfectivo(reserva, ahora);
    return estado === "completada" || estado === "en_curso";
  });
  const previstas = reservas.filter((reserva) => estadoEfectivo(reserva, ahora) === "confirmada");

  const reservasRealizadas = realizadas.reduce((suma, r) => suma + r.monto, 0);
  const reservasPrevistas = previstas.reduce((suma, r) => suma + r.monto, 0);

  // --- Ingresos por experiencias -------------------------------------------
  // Costo de una unidad de cada producto según su receta.
  //
  // El insumo se compra por kilo o por litro, pero se consume por gramo o por
  // mililitro: el factor de conversión divide el precio de compra entre las
  // unidades que contiene. Sin él, 18 g de café costarían 18 × 4200 en vez de
  // 18 × 4,20.
  const costoUnitario = new Map<number, number>();
  for (const receta of recetas) {
    const costoPorUnidad =
      receta.cantidad * (receta.insumo.costoUnitario / receta.insumo.factorConversion);
    costoUnitario.set(
      receta.productoId,
      (costoUnitario.get(receta.productoId) ?? 0) + costoPorUnidad,
    );
  }

  let experienciasRealizadas = 0;
  let experienciasPrevistas = 0;
  let costoExperiencias = 0;
  const detalleExperiencias: ReporteDTO["experiencias"] = [];

  for (const experiencia of experiences) {
    const participantes = experiencia.participantes.length;
    const ingresos = experiencia.precio * participantes;

    const costoProductos = experiencia.productos.reduce(
      (suma, item) => suma + Math.round((costoUnitario.get(item.producto.id) ?? 0) * item.cantidad),
      0,
    );
    const horas = hoursBetween(experiencia.inicio, experiencia.fin);
    const costoEspacio = Math.round(horas * experiencia.espacio.tarifaHora);

    if (experiencia.estado === "finalizada" || experiencia.estado === "en_curso") {
      experienciasRealizadas += ingresos;
      costoExperiencias += costoProductos;
    } else if (experiencia.estado === "programada") {
      experienciasPrevistas += ingresos;
    }

    detalleExperiencias.push({
      id: experiencia.id,
      nombre: experiencia.nombre,
      estado: experiencia.estado,
      participantes,
      capacidad: experiencia.capacidad,
      ingresos,
      costoProductos,
      costoEspacio,
      margen: ingresos - costoProductos - costoEspacio,
    });
  }

  // --- Egresos -------------------------------------------------------------
  // El costo de insumos es el de los productos efectivamente vendidos.
  let costoInsumos = 0;
  const porDia = new Map<string, { ingresos: number; insumos: number }>();
  const topMap = new Map<
    number,
    { id: number; nombre: string; cantidad: number; ingresos: number }
  >();

  for (const item of itemsVendidos) {
    const costoItem = Math.round((costoUnitario.get(item.productoId) ?? 0) * item.cantidad);
    costoInsumos += costoItem;

    const dia = dateISO(item.venta.fecha);
    const acumulado = porDia.get(dia) ?? { ingresos: 0, insumos: 0 };
    acumulado.ingresos += item.precio * item.cantidad;
    acumulado.insumos += costoItem;
    porDia.set(dia, acumulado);

    const actual = topMap.get(item.productoId) ?? {
      id: item.productoId,
      nombre: item.producto.nombre,
      cantidad: 0,
      ingresos: 0,
    };
    actual.cantidad += item.cantidad;
    actual.ingresos += item.cantidad * item.precio;
    topMap.set(item.productoId, actual);
  }

  // Los costos fijos se prorratean sobre el período analizado.
  const periodosRelevantes = new Set(diasDelPeriodo(periodo).map((dia) => dia.slice(0, 7)));
  const costosDelPeriodo = costos.filter((costo) => periodosRelevantes.has(costo.periodo));

  const detalleCostos = costosDelPeriodo.map((costo) => ({
    id: costo.id,
    concepto: costo.concepto,
    categoria: costo.categoria,
    monto: costo.monto,
    periodo: costo.periodo,
    estado: costo.estado,
    prorrateado: Math.round(prorratear(costo.monto, costo.periodo, periodo.start, periodo.end)),
  }));
  const costosFijos = detalleCostos.reduce((suma, costo) => suma + costo.prorrateado, 0);

  const totalVentas = ventas._sum.total ?? 0;
  const ingresosTotal = totalVentas + reservasRealizadas + experienciasRealizadas;
  const egresosTotal = costosFijos + costoInsumos + costoExperiencias;

  // --- Utilización de espacios ---------------------------------------------
  const reservasPeriodo = await prisma.reserva.findMany({
    where: {
      estado: { not: "cancelada" },
      inicio: { lt: finDate },
      fin: { gt: inicioDate },
    },
    select: { espacioId: true, inicio: true, fin: true },
  });

  const capacidadTotal = periodo.days * HORAS_JORNADA;
  const utilizacion = espacios.map((espacio) => {
    const horas = reservasPeriodo
      .filter((reserva) => reserva.espacioId === espacio.id)
      .reduce(
        (suma, reserva) =>
          suma + horasRecortadas(reserva.inicio, reserva.fin, inicioRango, finRango),
        0,
      );
    return {
      id: espacio.id,
      nombre: espacio.nombre,
      tipo: espacio.tipo,
      horas: Math.round(horas * 10) / 10,
      porcentaje: capacidadTotal > 0 ? Math.round((horas / capacidadTotal) * 1000) / 10 : 0,
    };
  });

  // La ocupación promedio solo mira los espacios que se pueden reservar por
  // hora: un puesto o una sala. Una mesa de cafetería no compite por el mismo
  // horario.
  const rentables = utilizacion.filter((item) => item.tipo === "puesto" || item.tipo === "sala");
  const ocupacionPromedio =
    rentables.length > 0
      ? Math.round(
          (rentables.reduce((suma, item) => suma + item.porcentaje, 0) / rentables.length) * 10,
        ) / 10
      : 0;

  // --- Demanda por hora ----------------------------------------------------
  const demanda = Array.from({ length: FRANJAS_DEMANDA }, (_, indice) => ({
    hora: HORA_INICIO + indice,
    reservas: 0,
    ventas: 0,
  }));

  for (const reserva of reservasPeriodo) {
    const hora = reserva.inicio.getHours();
    const bucket = demanda.find((item) => item.hora === hora);
    if (bucket) bucket.reservas += 1;
  }

  for (const item of itemsVendidos) {
    const hora = item.venta.fecha.getHours();
    const bucket = demanda.find((item) => item.hora === hora);
    if (bucket) bucket.ventas += 1;
  }

  // --- Flujo diario --------------------------------------------------------
  const reservasPorDia = new Map<string, number>();
  for (const reserva of realizadas) {
    const dia = dateISO(reserva.inicio);
    if (dia >= periodo.start.slice(0, 10) && dia < periodo.end.slice(0, 10)) {
      reservasPorDia.set(dia, (reservasPorDia.get(dia) ?? 0) + reserva.monto);
    }
  }

  const fijoPorDia = periodo.days > 0 ? Math.round(costosFijos / periodo.days) : 0;
  const flujo = diasDelPeriodo(periodo).map((dia) => {
    const acumulado = porDia.get(dia) ?? { ingresos: 0, insumos: 0 };
    return {
      dia,
      ingresos: acumulado.ingresos + (reservasPorDia.get(dia) ?? 0),
      egresos: acumulado.insumos + fijoPorDia,
    };
  });

  return {
    rango: periodo.key,
    periodo: periodo.label,
    desde: periodo.start.slice(0, 10),
    // El fin es exclusivo: el último día analizado es el anterior.
    hasta: dateISO(addDays(parseFecha(periodo.end.slice(0, 10))!, -1)),
    ingresos: {
      ventas: totalVentas,
      reservasRealizadas,
      reservasPrevistas,
      experienciasRealizadas,
      experienciasPrevistas,
      total: ingresosTotal,
    },
    egresos: {
      fijos: costosFijos,
      insumos: costoInsumos,
      experiencias: costoExperiencias,
      total: egresosTotal,
      detalle: detalleCostos,
    },
    margenRealizado: ingresosTotal - egresosTotal,
    ocupacionPromedio,
    utilizacion,
    demanda,
    flujo,
    topProductos: [...topMap.values()].sort((a, b) => b.ingresos - a.ingresos).slice(0, 6),
    experiencias: detalleExperiencias,
  };
}

export type { Periodo, Prisma };
