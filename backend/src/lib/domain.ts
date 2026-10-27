import type { TipoEspacio, TipoMembresia } from "@prisma/client";

/** Fecha local sin zona horaria, en el formato que usa el negocio. */
export function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function dateISO(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function addDays(base: Date, offset: number): Date {
  const date = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  date.setDate(date.getDate() + offset);
  return date;
}

/** Combina una fecha local con una hora "HH:MM" en un Date local. */
export function dayStamp(date: Date, time: string): Date {
  const [hour, minute] = time.split(":").map(Number);
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    hour ?? 0,
    minute ?? 0,
    0,
    0,
  );
}

export function hoursBetween(inicio: Date, fin: Date): number {
  return (fin.getTime() - inicio.getTime()) / 3_600_000;
}

/** Horario de atención del local. */
export const HORARIO_APERTURA = "07:00";
export const HORARIO_CIERRE = "23:00";

export const DURACION_MINIMA_HORAS = 1;
export const DURACION_MAXIMA_HORAS = 14;

export function sameDay(a: Date, b: Date): boolean {
  return dateISO(a) === dateISO(b);
}

/** Los intervalos se manejan en bloques de 30 minutos. */
export function validMinutes(fecha: Date): boolean {
  return fecha.getMinutes() === 0 || fecha.getMinutes() === 30;
}

/** Una actividad debe estar dentro del horario de atención. */
export function withinService(inicio: Date, fin: Date): boolean {
  const start = `${pad(inicio.getHours())}:${pad(inicio.getMinutes())}`;
  const end = `${pad(fin.getHours())}:${pad(fin.getMinutes())}`;
  return start >= HORARIO_APERTURA && end <= HORARIO_CIERRE && start < end;
}

/** Dos intervalos se solapan si el inicio de uno cae dentro del otro. */
export function overlaps(inicioA: Date, finA: Date, inicioB: Date, finB: Date): boolean {
  return inicioA < finB && finA > inicioB;
}

/** Un turno u occupancy no puede pasar de medianoche. */
export function cruzaMedianoche(inicio: Date, fin: Date): boolean {
  return fin <= inicio;
}

/** Un evento no se cobra por hora de espacio: se cobra por el producto de la experiencia. */
export function montoReserva(params: {
  hours: number;
  tarifaHora: number;
  tipo: TipoEspacio;
  membresia: TipoMembresia;
  membresiaVence: Date | null;
  day: string;
  proposito: string;
}): number {
  const { hours, tarifaHora, tipo, membresia, membresiaVence, day, proposito } = params;
  if (proposito === "evento") return 0;

  let tarifa = tarifaHora;
  const venceISO = membresiaVence ? dateISO(membresiaVence) : null;
  const cubrePuesto =
    tipo === "puesto" &&
    ((membresia === "mensual" && venceISO !== null && venceISO >= day) ||
      (membresia === "dia" && venceISO === day));

  if (cubrePuesto) tarifa = 0;
  return Math.round(hours * tarifa);
}

export type EstadoReservaDerivado = "completada" | "en_curso" | "confirmada";

export function estadoPorHorario(inicio: Date, fin: Date, ahora: Date): EstadoReservaDerivado {
  if (fin <= ahora) return "completada";
  if (inicio <= ahora) return "en_curso";
  return "confirmada";
}

/** Generador determinista: la semilla produce siempre los mismos datos. */
export function mulberry32(seed: number): () => number {
  let value = seed;
  return function random(): number {
    value |= 0;
    value = (value + 0x6d2b79f5) | 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function weighted<T extends { weight: number }>(random: () => number, items: T[]): T {
  const first = items[0];
  if (!first) throw new Error("weighted() requiere al menos un elemento");
  let cursor = random();
  for (const item of items) {
    cursor -= item.weight;
    if (cursor <= 0) return item;
  }
  return items[items.length - 1] as T;
}