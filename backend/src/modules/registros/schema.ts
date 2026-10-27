import { z } from "zod";

export const listarRegistrosQuerySchema = z.object({
  accion: z.enum(["crear", "actualizar", "eliminar"]).optional(),
  entidad: z.string().trim().min(1).max(40).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export type ListarRegistrosQuery = z.infer<typeof listarRegistrosQuerySchema>;
