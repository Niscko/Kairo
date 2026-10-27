import { z } from "zod";

export const fechaSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Usa el formato AAAA-MM-DD")
  .refine((valor) => {
    const [year, month, day] = valor.split("-").map(Number);
    const fecha = new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);
    return (
      fecha.getFullYear() === year &&
      fecha.getMonth() === (month ?? 1) - 1 &&
      fecha.getDate() === day
    );
  }, "La fecha no existe");

export const horaSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Usa el formato HH:MM");

export const listarTurnosQuerySchema = z.object({
  fecha: fechaSchema.optional(),
  empleadoId: z.coerce.number().int().positive().optional(),
});

export const crearTurnoSchema = z.object({
  empleadoId: z.coerce.number().int().positive("Selecciona a la persona"),
  fecha: fechaSchema,
  horaInicio: horaSchema,
  horaFin: horaSchema,
  area: z.string().trim().min(1, "El área es obligatoria").max(40),
});

export const listarEmpleadosQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
});

export type CrearTurnoInput = z.infer<typeof crearTurnoSchema>;
export type ListarTurnosQuery = z.infer<typeof listarTurnosQuerySchema>;
