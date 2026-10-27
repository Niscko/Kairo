import { Router } from "express";
import { z } from "zod";

import { ValidationError } from "../../lib/errors.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import {
  actualizarProductoSchema,
  crearInsumoSchema,
  crearMovimientoSchema,
  crearProductoSchema,
  crearProveedorSchema,
  listarInsumosQuerySchema,
  listarMovimientosQuerySchema,
  listarProductosQuerySchema,
  listarProveedoresQuerySchema,
} from "./schema.js";
import {
  actualizarProducto,
  crearInsumo,
  crearMovimiento,
  crearProducto,
  crearProveedor,
  listarInsumos,
  listarMovimientos,
  listarProductos,
  listarProveedores,
} from "./service.js";

const idParamSchema = z.coerce.number().int().positive();

export function productosRouter(): Router {
  const router = Router();

  router.use(requireAuth);

  // GET /api/productos — el menú lo consulta cualquier persona autenticada.
  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const query = listarProductosQuerySchema.parse(req.query);
      res.status(200).json({ productos: await listarProductos(query) });
    }),
  );
  // POST /api/productos
  router.post(
    "/",
    requireRole("admin", "empleado"),
    asyncHandler(async (req, res) => {
      const input = crearProductoSchema.parse(req.body);
      res.status(201).json(await crearProducto(input));
    }),
  );

  // PATCH /api/productos/:id
  router.patch(
    "/:id",
    requireRole("admin", "empleado"),
    asyncHandler(async (req, res) => {
      const id = parseId(req.params.id);
      const input = actualizarProductoSchema.parse(req.body);
      res.status(200).json(await actualizarProducto(id, input));
    }),
  );

  return router;
}

export function insumosRouter(): Router {
  const router = Router();

  router.use(requireAuth);

  // GET /api/insumos — solo el personal ve costos de inventario.
  router.get(
    "/",
    requireRole("admin", "empleado"),
    asyncHandler(async (req, res) => {
      const query = listarInsumosQuerySchema.parse(req.query);
      res.status(200).json({ insumos: await listarInsumos(query) });
    }),
  );

  // POST /api/insumos
  router.post(
    "/",
    requireRole("admin"),
    asyncHandler(async (req, res) => {
      const input = crearInsumoSchema.parse(req.body);
      res.status(201).json(await crearInsumo(input));
    }),
  );

  return router;
}

export function movimientosRouter(): Router {
  const router = Router();

  router.use(requireAuth);

  // GET /api/movimientos
  router.get(
    "/",
    requireRole("admin", "empleado"),
    asyncHandler(async (req, res) => {
      const query = listarMovimientosQuerySchema.parse(req.query);
      res.status(200).json({ movimientos: await listarMovimientos(query) });
    }),
  );

  // POST /api/movimientos
  router.post(
    "/",
    requireRole("admin", "empleado"),
    asyncHandler(async (req, res) => {
      const input = crearMovimientoSchema.parse(req.body);
      res.status(201).json(await crearMovimiento(input));
    }),
  );

  return router;
}

export function proveedoresRouter(): Router {
  const router = Router();

  router.use(requireAuth);

  // GET /api/proveedores
  router.get(
    "/",
    requireRole("admin", "empleado"),
    asyncHandler(async (req, res) => {
      const query = listarProveedoresQuerySchema.parse(req.query);
      res.status(200).json({ proveedores: await listarProveedores(query) });
    }),
  );

  // POST /api/proveedores
  router.post(
    "/",
    requireRole("admin"),
    asyncHandler(async (req, res) => {
      const input = crearProveedorSchema.parse(req.body);
      res.status(201).json(await crearProveedor(input));
    }),
  );

  return router;
}

function parseId(raw: string | undefined): number {
  const parsed = idParamSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError("El identificador debe ser un número positivo");
  }
  return parsed.data;
}
