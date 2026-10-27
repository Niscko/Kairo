import { z } from "zod";

export const agendaQuerySchema = z.object({
  dia: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Usa el formato AAAA-MM-DD")
    .optional(),
});

export type AgendaQuery = z.infer<typeof agendaQuerySchema>;
