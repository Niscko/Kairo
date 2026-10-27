import { z } from "zod";

import { Rol, TipoMembresia } from "@prisma/client";

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
  salario: z.coerce.number().int().min(0, "El salario no puede ser negativo").max(100_000_000).optional(),
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

export type ListarUsuariosQuery = z.infer<typeof listarUsuariosQuerySchema>;
export type CrearUsuarioInput = z.infer<typeof crearUsuarioSchema>;
export type ActualizarUsuarioInput = z.infer<typeof actualizarUsuarioSchema>;
