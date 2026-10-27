import { addDays, dateISO, dayStamp } from "./domain.js";
import { ValidationError } from "./errors.js";

/**
 * Períodos de análisis admitidos por los reportes.
 *
 * "custom" toma un rango explícito; el resto son ventanas relativas a hoy.
 */
export type Rango = "hoy" | "7d" | "21d" | "mes" | "custom";

export interface Periodo {
  key: Rango;
  /** Etiqueta legible del período. */
  label: string;
  /** Inicio del rango, inclusive, en "YYYY-MM-DD HH:MM". */
  start: string;
  /** Fin del rango, exclusivo, en "YYYY-MM-DD HH:MM". */
  end: string;
  /** Número de días que cubre el rango. */
  days: number;
}

/** Máximo de días que se puede analizar de una vez. */
export const DIAS_MAXIMOS = 90;

/** Parsea "YYYY-MM-DD" a Date local, o null si no existe. */
export function parseFecha(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [year, month, day] = iso.split("-").map(Number);
  const fecha = new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);
  if (
    fecha.getFullYear() !== year ||
    fecha.getMonth() !== (month ?? 1) - 1 ||
    fecha.getDate() !== day
  ) {
    return null;
  }
  return fecha;
}

/**
 * Formatea un Date local como "YYYY-MM-DD HH:MM".
 *
 * No se usa `toISOString()`: convierte a UTC y desplaza la medianoche local
 * un día cuando la zona horaria no es UTC.
 */
export function formatoLocal(fecha: Date): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${dateISO(fecha)} ${pad(fecha.getHours())}:${pad(fecha.getMinutes())}`;
}

/** Primer y último día del mes de una fecha. */
export function mesDe(fecha: Date): { periodo: string; inicio: Date; fin: Date } {
  const inicio = new Date(fecha.getFullYear(), fecha.getMonth(), 1);
  const fin = new Date(fecha.getFullYear(), fecha.getMonth() + 1, 1);
  return {
    periodo: `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}`,
    inicio,
    fin,
  };
}

/**
 * Resuelve el período solicitado.
 *
 * El fin es exclusivo: un rango que termina el 15 incluye ese día, y el
 * siguiente período empieza el 16 sin huecos ni solapes.
 */
export function resolverPeriodo(
  opciones: { rango?: string; desde?: string; hasta?: string },
  ahora: Date = new Date(),
): Periodo {
  const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  const manana = addDays(hoy, 1);
  const clave: Rango = (["hoy", "7d", "21d", "mes", "custom"] as const).includes(
    opciones.rango as Rango,
  )
    ? (opciones.rango as Rango)
    : "mes";

  if (clave === "hoy") {
    return {
      key: clave,
      label: "Hoy",
      start: formatoLocal(dayStamp(hoy, "00:00")),
      end: formatoLocal(dayStamp(manana, "00:00")),
      days: 1,
    };
  }

  if (clave === "7d" || clave === "21d") {
    const dias = clave === "7d" ? 7 : 21;
    const inicio = addDays(hoy, -(dias - 1));
    return {
      key: clave,
      label: dias === 7 ? "Últimos 7 días" : "Últimos 21 días",
      start: formatoLocal(dayStamp(inicio, "00:00")),
      end: formatoLocal(dayStamp(manana, "00:00")),
      days: dias,
    };
  }

  if (clave === "custom") {
    const desde = parseFecha(opciones.desde ?? "");
    const hasta = parseFecha(opciones.hasta ?? "");
    if (!desde || !hasta) {
      throw new ValidationError("Indica una fecha inicial y una final");
    }
    if (desde > hasta) {
      throw new ValidationError("La fecha inicial no puede ser posterior a la final");
    }
    const fin = addDays(hasta, 1);
    const dias = Math.round((fin.getTime() - desde.getTime()) / 86_400_000);
    if (dias > DIAS_MAXIMOS) {
      throw new ValidationError(`El rango máximo es de ${DIAS_MAXIMOS} días`);
    }
    const inicioISO = dateISO(desde);
    const finISO = dateISO(hasta);
    return {
      key: clave,
      label: inicioISO === finISO ? inicioISO : `${inicioISO} a ${finISO}`,
      start: `${inicioISO} 00:00`,
      end: `${dateISO(fin)} 00:00`,
      days: dias,
    };
  }

  const mes = mesDe(hoy);
  return {
    key: "mes",
    label: `Mes ${mes.periodo}`,
    start: formatoLocal(dayStamp(mes.inicio, "00:00")),
    end: formatoLocal(dayStamp(mes.fin, "00:00")),
    days: Math.round((mes.fin.getTime() - mes.inicio.getTime()) / 86_400_000),
  };
}

/** Lista de días del período, en "YYYY-MM-DD". */
export function diasDelPeriodo(periodo: Periodo): string[] {
  const dias: string[] = [];
  let cursor = parseFecha(periodo.start.slice(0, 10));
  const fin = periodo.end.slice(0, 10);
  while (cursor && dateISO(cursor) < fin) {
    dias.push(dateISO(cursor));
    cursor = addDays(cursor, 1);
  }
  return dias;
}

/**
 * Prorratea un costo mensual sobre un rango parcial.
 *
 * Un arriendo de $8.500.000 en un mes de 30 días, analizado en 15 días, aporta
 * la mitad. Sin esto, un reporte de una semana mostraría el arriendo completo
 * y el margen saldría distortionado.
 */
export function prorratear(
  monto: number,
  periodoCosto: string,
  inicioRango: string,
  finRango: string,
): number {
  const [year, month] = periodoCosto.split("-").map(Number);
  const inicioMes = `${year}-${String(month).padStart(2, "0")}-01 00:00`;

  // El mes siguiente empieza el día 1; el fin del mes es ese día, exclusivo.
  const finMesDate = new Date(year ?? 0, month ?? 1, 1);
  const finMes = `${dateISO(finMesDate)} 00:00`;

  const solapamientoInicio = inicioRango > inicioMes ? inicioRango : inicioMes;
  const solapamientoFin = finRango < finMes ? finRango : finMes;
  if (solapamientoInicio >= solapamientoFin) return 0;

  const diasMes = Math.round(
    (new Date(finMes.replace(" ", "T")).getTime() -
      new Date(inicioMes.replace(" ", "T")).getTime()) /
      86_400_000,
  );
  const diasSolapados = Math.round(
    (new Date(solapamientoFin.replace(" ", "T")).getTime() -
      new Date(solapamientoInicio.replace(" ", "T")).getTime()) /
      86_400_000,
  );
  if (diasMes <= 0) return 0;
  return monto * (diasSolapados / diasMes);
}

/**
 * Horas de una reserva dentro de un rango, recortadas a los límites.
 *
 * Una reserva de 3 horas que empieza antes del rango solo cuenta la parte
 * que cae dentro.
 */
export function horasRecortadas(
  inicio: Date,
  fin: Date,
  inicioRango: Date,
  finRango: Date,
): number {
  const inicioReal = Math.max(inicio.getTime(), inicioRango.getTime());
  const finReal = Math.min(fin.getTime(), finRango.getTime());
  return Math.max(0, (finReal - inicioReal) / 3_600_000);
}
