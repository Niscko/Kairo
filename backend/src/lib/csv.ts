/**
 * Utilidades para generar CSV.
 *
 * Se escriben a mano en vez de usar una librería porque el formato es simple y
 * esto evita una dependencia para una función de veinte líneas.
 */

/** Escapa un valor para CSV: si contiene coma, comilla o salto, va entrecomillado. */
export function escaparCsv(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  const texto = String(valor);
  if (/[",\n\r]/.test(texto)) {
    return `"${texto.replace(/"/g, '""')}"`;
  }
  return texto;
}

/**
 * Convierte filas en texto CSV.
 *
 * La primera fila es la cabecera. El separador es punto y coma porque el
 * coma es el separador decimal en Colombia: con coma, Excel en español
 * interpretaría mal las cifras.
 */
export function aCsv(encabezados: string[], filas: Array<Array<unknown>>): string {
  const lineas = [encabezados.map(escaparCsv).join(";")];
  for (const fila of filas) {
    lineas.push(fila.map(escaparCsv).join(";"));
  }
  // El BOM hace que Excel reconozca UTF-8 y no rompa los acentos. Se escribe
  // como escape: el carácter literal es un espacio irregular y ESLint lo rechaza.
  return `\uFEFF${lineas.join("\r\n")}\r\n`;
}

/** Nombre de archivo con marca de tiempo, para la descarga. */
export function nombreArchivo(base: string, fecha: Date = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  const marca = `${fecha.getFullYear()}${pad(fecha.getMonth() + 1)}${pad(fecha.getDate())}-${pad(fecha.getHours())}${pad(fecha.getMinutes())}`;
  return `${base}-${marca}.csv`;
}
