import { ValidationError } from "./errors.js";
import {
  DURACION_MAXIMA_HORAS,
  DURACION_MINIMA_HORAS,
  hoursBetween,
  sameDay,
  validMinutes,
  withinService,
} from "./domain.js";

/**
 * Reglas de horario compartidas entre reservas y turnos.
 *
 * Se validan aquí, y no en cada módulo, para que el conjunto de reglas sea
 * uno solo: si el local acepta reservas en bloques de 30 minutos dentro de
 * 07:00–23:00, los turnos deben seguir las mismas reglas.
 */

/** Valida un bloque horario y devuelve su duración en horas. */
export function validarHorario(inicio: Date, fin: Date): number {
  if (!sameDay(inicio, fin)) {
    throw new ValidationError("La actividad debe empezar y terminar el mismo día");
  }
  if (!validMinutes(inicio) || !validMinutes(fin)) {
    throw new ValidationError("Usa intervalos de 30 minutos");
  }
  if (!withinService(inicio, fin)) {
    throw new ValidationError("El horario de atención es de 7:00 a 23:00");
  }

  const hours = hoursBetween(inicio, fin);
  if (hours < DURACION_MINIMA_HORAS) {
    throw new ValidationError("La duración mínima es de una hora");
  }
  if (hours > DURACION_MAXIMA_HORAS) {
    throw new ValidationError("La duración máxima es de 14 horas");
  }
  return hours;
}

/** Patrón de hora "HH:MM" en formato de 24 horas. */
export const HORA_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function esHoraValida(valor: string): boolean {
  return HORA_PATTERN.test(valor);
}

/** Compara dos horas "HH:MM" en orden cronológico. */
export function horaEsAnterior(anterior: string, posterior: string): boolean {
  return anterior < posterior;
}
