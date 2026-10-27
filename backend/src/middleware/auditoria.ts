import type { RequestHandler, Response } from "express";

import { describirCambio, type Cambio } from "../lib/auditoria.js";
import type { ActorAuditoria } from "../lib/auditoria-db.js";

export type GuardarCambio = (actor: ActorAuditoria, cambio: Cambio) => Promise<void>;

async function guardarPorDefecto(actor: ActorAuditoria, cambio: Cambio): Promise<void> {
  const { guardarCambio } = await import("../lib/auditoria-db.js");
  await guardarCambio(actor, cambio);
}

async function avisar(mensaje: string, error: unknown): Promise<void> {
  try {
    const { logger } = await import("../config/logger.js");
    logger.error({ err: error }, mensaje);
  } catch {
    // Sin configuración no hay logger. La respuesta de negocio no depende de esto.
  }
}

/**
 * Anota las escrituras que respondieron 2xx.
 *
 * Se engancha a `res.json` y `res.send` y espera a guardar el registro antes
 * de entregar la respuesta, así quien acaba de crear algo ya lo ve en el
 * listado. Si la bitácora falla, la operación de negocio igual se responde:
 * el fallo queda en el log del proceso.
 */
export function registrarActividad(guardar: GuardarCambio = guardarPorDefecto): RequestHandler {
  return (req, res, next) => {
    const metodo = req.method.toUpperCase();
    if (metodo !== "POST" && metodo !== "PATCH" && metodo !== "PUT" && metodo !== "DELETE") {
      next();
      return;
    }

    let decidido = false;
    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);

    const publicar = (enviar: () => Response, respuesta: unknown): Response => {
      if (decidido) return enviar();
      decidido = true;

      const status = res.statusCode || 200;
      const actor = req.auth;
      if (!actor || status < 200 || status >= 300) return enviar();

      const cambio = describirCambio(metodo, req.originalUrl, req.body, respuesta);
      if (!cambio) return enviar();

      void Promise.resolve()
        .then(() => guardar(actor, cambio))
        .catch((error: unknown) => {
          void avisar("no se pudo guardar el registro de actividad", error);
        })
        .finally(() => {
          try {
            enviar();
          } catch (error) {
            void avisar("no se pudo enviar la respuesta tras el registro", error);
          }
        });
      return res;
    };

    res.json = function json(body: unknown) {
      return publicar(() => originalJson(body), body);
    } as Response["json"];

    res.send = function send(body?: unknown) {
      return publicar(() => originalSend(body), interpretar(body));
    } as Response["send"];

    next();
  };
}

function interpretar(body: unknown): unknown {
  if (typeof body === "string") {
    try {
      return JSON.parse(body) as unknown;
    } catch {
      return null;
    }
  }
  if (Buffer.isBuffer(body)) return null;
  return body ?? null;
}
