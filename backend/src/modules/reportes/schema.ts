import { z } from "zod";

export const reporteQuerySchema = z.object({
  rango: z.enum(["hoy", "7d", "21d", "mes", "custom"]).default("mes"),
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Usa el formato AAAA-MM-DD").optional(),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Usa el formato AAAA-MM-DD").optional(),
});

export type ReporteQuery = z.infer<typeof reporteQuerySchema>;
