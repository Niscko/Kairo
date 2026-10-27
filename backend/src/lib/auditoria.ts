/**
 * Describe una petición que ya tuvo éxito, sin tocar la base de datos.
 *
 * El registro guarda qué se agregó, cambió o quitó. No guarda sesiones,
 * contraseñas, tokens ni datos de contacto.
 */

export type AccionAuditoria = "crear" | "actualizar" | "eliminar";

export type DetalleAuditoria = Record<string, string | number | boolean | null>;

export interface Cambio {
  accion: AccionAuditoria;
  entidad: string;
  entidadId: string | null;
  resumen: string;
  detalle: DetalleAuditoria;
}

/** Rutas que no son altas ni bajas del negocio. */
const ENTIDADES_OMITIDAS = new Set(["auth", "health", "registros"]);

const CLAVES_OMITIDAS = new Set([
  "password",
  "passwordhash",
  "confirmacion",
  "actual",
  "token",
  "accesstoken",
  "refreshtoken",
  "codigo",
  "codigohash",
  "authorization",
  "cookie",
  "telefono",
  "documento",
]);

/** Campos que ayudan a reconocer el registro en la pantalla de admin. */
const ETIQUETAS = [
  "nombre",
  "email",
  "concepto",
  "motivo",
  "estado",
  "activo",
  "zona",
  "tipo",
] as const;

export function describirCambio(
  method: string,
  path: string,
  body: unknown,
  respuesta: unknown,
): Cambio | null {
  const metodo = method.toUpperCase();
  if (metodo !== "POST" && metodo !== "PATCH" && metodo !== "PUT" && metodo !== "DELETE") {
    return null;
  }

  const segmentos = segmentosDe(path);
  const entidad = segmentos[0];
  if (!entidad || ENTIDADES_OMITIDAS.has(entidad)) return null;

  const subrecurso = segmentos.find((parte) => parte !== entidad && !/^\d+$/.test(parte)) ?? null;
  const idEnRuta = segmentos.find((parte) => /^\d+$/.test(parte)) ?? null;
  const idRespuesta = idDe(respuesta);

  const accion = accionDe(metodo, subrecurso);
  const detalle = detalleDe(body, respuesta);
  if (subrecurso) detalle.subrecurso = subrecurso;
  if (idRespuesta && idEnRuta && idRespuesta !== idEnRuta) {
    detalle.resultadoId = idRespuesta;
  }

  const entidadId = idEnRuta ?? idRespuesta;
  const resumen = armarResumen(accion, entidad, subrecurso, entidadId, detalle);

  return { accion, entidad, entidadId, resumen, detalle };
}

function segmentosDe(path: string): string[] {
  const sinQuery = path.split("?")[0] ?? path;
  return sinQuery
    .replace(/^\/api\/?/, "")
    .split("/")
    .filter((parte) => parte.length > 0);
}

function accionDe(metodo: string, subrecurso: string | null): AccionAuditoria {
  if (metodo === "DELETE" || subrecurso === "cancelar") return "eliminar";
  if (metodo === "PATCH" || metodo === "PUT" || subrecurso === "cerrar") return "actualizar";
  return "crear";
}

function detalleDe(body: unknown, respuesta: unknown): DetalleAuditoria {
  const detalle: DetalleAuditoria = {};
  copiarEscalas(detalle, body);
  copiarEtiquetas(detalle, respuesta);
  return detalle;
}

function copiarEscalas(destino: DetalleAuditoria, origen: unknown): void {
  if (!esObjeto(origen)) return;
  for (const [clave, valor] of Object.entries(origen)) {
    if (esSensible(clave)) continue;
    if (typeof valor === "string") {
      const texto = valor.trim();
      if (texto.length > 0 && texto.length <= 180) destino[clave] = texto;
      continue;
    }
    if (typeof valor === "number" && Number.isFinite(valor)) {
      destino[clave] = valor;
      continue;
    }
    if (typeof valor === "boolean") {
      destino[clave] = valor;
      continue;
    }
    if (Array.isArray(valor)) {
      destino[`${clave}Cantidad`] = valor.length;
    }
  }
}

function copiarEtiquetas(destino: DetalleAuditoria, respuesta: unknown): void {
  if (!esObjeto(respuesta)) return;
  for (const clave of ETIQUETAS) {
    if (destino[clave] != null || esSensible(clave)) continue;
    const valor = respuesta[clave];
    if (typeof valor === "string") {
      const texto = valor.trim();
      if (texto.length > 0 && texto.length <= 180) destino[clave] = texto;
    } else if (typeof valor === "boolean") {
      destino[clave] = valor;
    }
  }
}

function armarResumen(
  accion: AccionAuditoria,
  entidad: string,
  subrecurso: string | null,
  entidadId: string | null,
  detalle: DetalleAuditoria,
): string {
  const etiqueta =
    texto(detalle.nombre) ??
    texto(detalle.email) ??
    texto(detalle.concepto) ??
    texto(detalle.motivo);
  const partes = [accion, entidad];
  if (subrecurso) partes.push(subrecurso);
  if (entidadId) partes.push(`#${entidadId}`);
  if (etiqueta) partes.push(etiqueta);
  const resumen = partes.join(" ");
  return resumen.length <= 180 ? resumen : `${resumen.slice(0, 179)}…`;
}

function idDe(valor: unknown): string | null {
  if (!esObjeto(valor)) return null;
  const id = valor.id;
  if (typeof id === "number" && Number.isInteger(id)) return String(id);
  if (typeof id === "string" && /^\d+$/.test(id)) return id;
  return null;
}

function esSensible(clave: string): boolean {
  const normal = clave.toLowerCase();
  return CLAVES_OMITIDAS.has(normal) || /password|token|secret|hash/.test(normal);
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function texto(valor: DetalleAuditoria[string] | undefined): string | null {
  return typeof valor === "string" && valor.length > 0 ? valor : null;
}
