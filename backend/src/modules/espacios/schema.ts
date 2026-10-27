import { z } from "zod";

import { TipoEspacio, EstadoEspacio } from "@prisma/client";

/** Traduce los enums de Prisma a valores aceptados por la API y el frontend. */
export const tipoEspacioSchema = z.nativeEnum(TipoEspacio);
export const estadoEspacioSchema = z.nativeEnum(EstadoEspacio);

export const crearEspacioSchema = z.object({
  nombre: z.string().trim().min(3, "El nombre debe tener al menos 3 caracteres").max(120),
  tipo: tipoEspacioSchema,
  capacidad: z.coerce.number().int().min(1, "La capacidad debe ser al menos 1").max(1000),
  tarifaHora: z.coerce.number().int().min(0, "La tarifa no puede ser negativa").max(10_000_000),
  zona: z.string().trim().min(1, "La zona es obligatoria").max(80),
});

export const actualizarEspacioSchema = crearEspacioSchema.partial().extend({
  estado: estadoEspacioSchema.optional(),
});

export const listarEspaciosQuerySchema = z.object({
  tipo: tipoEspacioSchema.optional(),
  estado: estadoEspacioSchema.optional(),
  zona: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export type CrearEspacioInput = z.infer<typeof crearEspacioSchema>;
export type ActualizarEspacioInput = z.infer<typeof actualizarEspacioSchema>;
export type ListarEspaciosQuery = z.infer<typeof listarEspaciosQuerySchema>;