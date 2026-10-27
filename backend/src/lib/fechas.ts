/**
 * Utilidades de fecha para el negocio.
 *
 * El local opera en una zona horaria (Bogotá por defecto) y la base guarda
 * marcas de tiempo en UTC. Estas funciones son el único punto donde se
 * traduce entre ambos mundos, para que la conversión no se disperse por los
 * módulos.
 */

/** Zona horaria del negocio. Debe coincidir con la de la base de datos. */
export const ZONA_NEGOCIO = process.env.TZ ?? "America/Bogota";

/**
 * Construye la medianoche de un día "YYYY-MM-DD" en hora local.
 *
 * Se usa para los datos que representan un día sin hora: un turno, la
 * vencimiento de un permiso, el inicio de un mes. El constructor sin `Z`
 * interpreta la cadena en hora local, que es lo que se busca aquí.
 */
export function diaLocal(fechaISO: string): Date {
  const [year, month, day] = fechaISO.split("-").map(Number);
  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1, 0, 0, 0, 0);
}

/**
 * Igual que `diaLocal`, pero en UTC.
 *
 * Se usa cuando la fecha funciona como clave de agrupación o filtro exacto
 * (por ejemplo, los turnos de un día): así el valor es el mismo la lea quien
 * lo lea, sin importar la zona del proceso.
 */
export function diaUTC(fechaISO: string): Date {
  const [year, month, day] = fechaISO.split("-").map(Number);
  return new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1, 0, 0, 0, 0));
}

/** Extrae "YYYY-MM-DD" de una fecha, en hora local. */
export function fechaISO(fecha: Date): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}`;
}
