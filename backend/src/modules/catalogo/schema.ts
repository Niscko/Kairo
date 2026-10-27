import { z } from "zod";

import { CategoriaProducto, TipoMovimiento } from "@prisma/client";

export const listarProductosQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  categoria: z.nativeEnum(CategoriaProducto).optional(),
  soloActivos: z
    .enum(["true", "false"])
    .default("true")
    .transform((valor) => valor === "true"),
});

export const crearProductoSchema = z.object({
  nombre: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres").max(120),
  categoria: z.nativeEnum(CategoriaProducto),
  precio: z.coerce.number().int().min(0, "El precio no puede ser negativo").max(100_000_000),
  descripcion: z.string().trim().max(500).optional(),
  esAlcohol: z.boolean().default(false),
});

export const actualizarProductoSchema = crearProductoSchema.partial().extend({
  activo: z.boolean().optional(),
});

export const listarInsumosQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  bajoMinimo: z
    .enum(["true", "false"])
    .default("false")
    .transform((valor) => valor === "true"),
});

export const crearInsumoSchema = z.object({
  nombre: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres").max(120),
  unidad: z.string().trim().min(1, "La unidad es obligatoria").max(20),
  stock: z.coerce.number().min(0, "El stock no puede ser negativo").default(0),
  stockMinimo: z.coerce.number().min(0, "El stock mínimo no puede ser negativo").default(0),
  costoUnitario: z.coerce.number().int().min(0).max(100_000_000),
  proveedorId: z.coerce.number().int().positive().nullable().optional(),
});

export const listarMovimientosQuerySchema = z.object({
  insumoId: z.coerce.number().int().positive().optional(),
  tipo: z.nativeEnum(TipoMovimiento).optional(),
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Usa el formato AAAA-MM-DD").optional(),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Usa el formato AAAA-MM-DD").optional(),
  limite: z.coerce.number().int().min(1).max(500).default(100),
});

export const crearMovimientoSchema = z.object({
  insumoId: z.coerce.number().int().positive("Selecciona el insumo"),
  tipo: z.nativeEnum(TipoMovimiento),
  cantidad: z.coerce.number().positive("La cantidad debe ser mayor que cero"),
  motivo: z.string().trim().max(200).optional(),
  referencia: z.string().trim().max(80).optional(),
});

export const listarProveedoresQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
});

export const crearProveedorSchema = z.object({
  nombre: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres").max(120),
  contacto: z.string().trim().max(120).optional(),
  telefono: z.string().trim().max(30).optional(),
  categoria: z.string().trim().min(1, "La categoría es obligatoria").max(60),
});

export const recetaSchema = z.object({
  insumoId: z.coerce.number().int().positive(),
  cantidad: z.coerce.number().positive("La cantidad debe ser mayor que cero"),
});

export type CrearProductoInput = z.infer<typeof crearProductoSchema>;
export type ActualizarProductoInput = z.infer<typeof actualizarProductoSchema>;
export type CrearInsumoInput = z.infer<typeof crearInsumoSchema>;
export type CrearMovimientoInput = z.infer<typeof crearMovimientoSchema>;
export type CrearProveedorInput = z.infer<typeof crearProveedorSchema>;
