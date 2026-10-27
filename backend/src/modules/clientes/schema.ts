import { z } from "zod";

import { Rol, TipoMembresia } from "@prisma/client";

export const listarClientesQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  membresia: z.nativeEnum(TipoMembresia).optional(),
  soloActivos: z
    .enum(["true", "false"])
    .default("true")
    .transform((valor) => valor === "true"),
});

export const actualizarClienteSchema = z.object({
  nombre: z.string().trim().min(3, "El nombre debe tener al menos 3 caracteres").max(120).optional(),
  email: z.string().email("Correo electrónico inválido").optional(),
  telefono: z.string().trim().max(30).nullable().optional(),
  documento: z.string().trim().max(40).nullable().optional(),
  membresia: z.nativeEnum(TipoMembresia).optional(),
  membresiaVence: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Usa el formato AAAA-MM-DD")
    .nullable()
    .optional(),
  activo: z.boolean().optional(),
});

export const listarUsuariosQuerySchema = z.object({
  rol: z.nativeEnum(Rol).optional(),
  q: z.string().trim().max(80).optional(),
});

export const crearUsuarioSchema = z.object({
  nombre: z.string().trim().min(3, "El nombre debe tener al menos 3 caracteres").max(120),
  email: z.string().email("Correo electrónico inválido"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres").max(200),
  rol: z.nativeEnum(Rol),
  telefono: z.string().trim().max(30).optional(),
  cargo: z.string().trim().max(60).optional(),
  documento: z.string().trim().max(40).optional(),
  membresia: z.nativeEnum(TipoMembresia).optional(),
});

export const actualizarUsuarioSchema = z.object({
  nombre: z.string().trim().min(3).max(120).optional(),
  email: z.string().email("Correo electrónico inválido").optional(),
  telefono: z.string().trim().max(30).nullable().optional(),
  rol: z.nativeEnum(Rol).optional(),
  activo: z.boolean().optional(),
});

export type ActualizarClienteInput = z.infer<typeof actualizarClienteSchema>;
export type ListarClientesQuery = z.infer<typeof listarClientesQuerySchema>;
export type CrearUsuarioInput = z.infer<typeof crearUsuarioSchema>;
export type ActualizarUsuarioInput = z.infer<typeof actualizarUsuarioSchema>;
