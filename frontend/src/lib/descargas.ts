/**
 * Descarga un archivo generado por la API.
 *
 * No se puede usar un `<a href>`: la API exige el token en la cabecera
 * `Authorization`, y un enlace no puede mandarla. Por eso se pide con `fetch`
 * —que sí lo lleva— y se entrega al navegador como un blob.
 */
export async function descargarArchivo(
  ruta: string,
  nombreSugerido: string,
): Promise<void> {
  const respuesta = await apiRequestRaw(ruta);

  const nombre = nombreDesdeCabecera(respuesta.headers.get("content-disposition")) ?? nombreSugerido;
  const blob = await respuesta.blob();
  const url = URL.createObjectURL(blob);

  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);

  // Libera el objeto: sin esto, el blob queda retenido en memoria.
  URL.revokeObjectURL(url);
}

/** Petición sin procesar: devuelve la Response completa, no el JSON. */
async function apiRequestRaw(ruta: string): Promise<Response> {
  const token = sessionStorage.getItem("kairo.access");
  const cabeceras = new Headers();
  if (token) cabeceras.set("Authorization", `Bearer ${token}`);

  const respuesta = await fetch(ruta, { headers: cabeceras, credentials: "include" });

  if (!respuesta.ok) {
    throw new Error(`No se pudo descargar el archivo (${respuesta.status})`);
  }
  return respuesta;
}

/** Extrae el nombre del archivo de la cabecera Content-Disposition. */
function nombreDesdeCabecera(cabecera: string | null): string | null {
  if (!cabecera) return null;
  const coincidencia = /filename="?([^";]+)"?/.exec(cabecera);
  return coincidencia?.[1] ?? null;
}
