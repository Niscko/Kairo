import { z } from "zod";

import { EstadoEquipo, TipoEquipo, EstadoCosto, EstadoPermiso } from "@prisma/client";

export const listarEquiposQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  tipo: z.nativeEnum(TipoEquipo).optional(),
  estado: z.nativeEnum(EstadoEquipo).optional(),
});

export const crearEquipoSchema = z.object({
  nombre: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres").max(120),
  tipo: z.nativeEnum(TipoEquipo),
  estado: z.nativeEnum(EstadoEquipo).default("operativo"),
  espacioId: z.coerce.number().int().positive().nullable().optional(),
  costo: z.coerce.number().int().min(0).default(0),
});

export const actualizarEquipoSchema = z.object({
  nombre: z.string().trim().min(2).max(120).optional(),
  tipo: z.nativeEnum(TipoEquipo).optional(),
  estado: z.nativeEnum(EstadoEquipo).optional(),
  espacioId: z.coerce.number().int().positive().nullable().optional(),
  costo: z.coerce.number().int().min(0).optional(),
});

export const listarCostosQuerySchema = z.object({
  periodo: z.string().regex(/^\d{4}-\d{2}$/, "Usa el formato AAAA-MM").optional(),
  estado: z.nativeEnum(EstadoCosto).optional(),
});

export const crearCostoSchema = z.object({
  concepto: z.string().trim().min(2, "El concepto debe tener al menos 2 caracteres").max(160),
  categoria: z.string().trim().min(1, "La categoría es obligatoria").max(60),
  monto: z.coerce.number().int().min(0, "El monto no puede ser negativo").max(1_000_000_000),
  periodo: z.string().regex(/^\d{4}-\d{2}$/, "Usa el formato AAAA-MM"),
  vencimiento: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Usa el formato AAAA-MM-DD")
    .nullable()
    .optional(),
  estado: z.nativeEnum(EstadoCosto).default("pendiente"),
});

export const actualizarCostoSchema = z.object({
  concepto: z.string().trim().min(2).max(160).optional(),
  categoria: z.string().trim().min(1).max(60).optional(),
  monto: z.coerce.number().int().min(0).optional(),
  periodo: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  vencimiento: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  estado: z.nativeEnum(EstadoCosto).optional(),
});

export const listarPermisosQuerySchema = z.object({
  estado: z.nativeEnum(EstadoPermiso).optional(),
});

export const crearPermisoSchema = z.object({
  nombre: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres").max(120),
  entidad: z.string().trim().min(1, "La entidad es obligatoria").max(120),
  numero: z.string().trim().max(60).optional(),
  vencimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Usa el formato AAAA-MM-DD"),
});

export type CrearEquipoInput = z.infer<typeof crearEquipoSchema>;
export type ActualizarEquipoInput = z.infer<typeof actualizarEquipoSchema>;
export type CrearCostoInput = z.infer<typeof crearCostoSchema>;
export type ActualizarCostoInput = z.infer<typeof actualizarCostoSchema>;
export type CrearPermisoInput = z.infer<typeof crearPermisoSchema>;
