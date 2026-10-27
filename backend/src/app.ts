import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";

import { config } from "./config/env.js";
import { logger } from "./config/logger.js";
import { ForbiddenError } from "./lib/errors.js";
import { errorHandler, notFoundHandler } from "./middleware/error.js";
import { agendaRouter } from "./modules/agenda/routes.js";
import { authRouter } from "./modules/auth/routes.js";import {
  insumosRouter,
  movimientosRouter,
  productosRouter,
  proveedoresRouter,
} from "./modules/catalogo/routes.js";
import { clientesRouter } from "./modules/clientes/routes.js";
import { dashboardRouter } from "./modules/dashboard/routes.js";
import { espaciosRouter } from "./modules/espacios/routes.js";
import { experienciasRouter } from "./modules/experiencias/routes.js";
import { exportacionesRouter } from "./modules/exportaciones/routes.js";
import { healthRouter } from "./modules/health/routes.js";
import {
  costosRouter,
  equiposRouter,
  permisosRouter,
} from "./modules/operaciones/routes.js";
import { pedidosRouter } from "./modules/pedidos/routes.js";
import { reservasRouter } from "./modules/reservas/routes.js";
import { reportesRouter } from "./modules/reportes/routes.js";
import { empleadosRouter, turnosRouter } from "./modules/turnos/routes.js";
import { usuariosRouter } from "./modules/usuarios/routes.js";
import { ventasRouter } from "./modules/ventas/routes.js";

export function createApp(): Express {
  const app = express();

  // La app corre detrás de nginx en Docker: confío en el proxy solo en producción
  // para que req.ip refleje la IP real del cliente (rate limiting correcto).
  app.set("trust proxy", config.isProduction ? 1 : false);
  app.disable("x-powered-by");

  // --- Hardening ----------------------------------------------------------
  app.use(
    helmet({
      // El frontend es una SPA servida por otro origen; la CSP se ajusta en la
      // Fase 3 cuando exista el bundle con fuentes y estilos propios.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: "same-site" },
      referrerPolicy: { policy: "no-referrer" },
    }),
  );

  app.use(
    cors({
      origin(origin, callback) {
        // Sin cabecera Origin = peticiones same-origin, servidor a servidor o curl.
        if (!origin) return callback(null, true);
        if (config.corsOrigins.includes(origin)) return callback(null, true);
        callback(new ForbiddenError(`Origen no permitido por CORS: ${origin}`));
      },
      credentials: true,
      methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-XSRF-TOKEN"],
      exposedHeaders: ["X-Refresh-Expires"],
      maxAge: 600,
    }),
  );

  app.use(compression());
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  // --- Observabilidad -----------------------------------------------------
  app.use((req, res, next) => {
    const startedAt = process.hrtime.bigint();
    res.on("finish", () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      const level = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";
      logger[level](
        { method: req.method, path: req.originalUrl, status: res.statusCode, durationMs },
        "petición completada",
      );
    });
    next();
  });

  // --- Rutas --------------------------------------------------------------
  app.use("/api/health", healthRouter());
  app.use("/api/auth", authRouter());
  app.use("/api/agenda", agendaRouter());
  app.use("/api/dashboard", dashboardRouter());
  app.use("/api/usuarios", usuariosRouter());
  app.use("/api/espacios", espaciosRouter());
  app.use("/api/reservas", reservasRouter());
  app.use("/api/clientes", clientesRouter());
  app.use("/api/turnos", turnosRouter());
  app.use("/api/empleados", empleadosRouter());
  app.use("/api/productos", productosRouter());
  app.use("/api/insumos", insumosRouter());
  app.use("/api/movimientos", movimientosRouter());
  app.use("/api/proveedores", proveedoresRouter());
  app.use("/api/ventas", ventasRouter());
  app.use("/api/pedidos", pedidosRouter());
  app.use("/api/experiencias", experienciasRouter());
  app.use("/api/equipos", equiposRouter());
  app.use("/api/costos", costosRouter());
  app.use("/api/permisos", permisosRouter());
  app.use("/api/reportes", reportesRouter());
  app.use("/api/exportaciones", exportacionesRouter());

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}