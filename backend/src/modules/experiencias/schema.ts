import { z } from "zod";

export const datetimeLocalSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/, "Usa el formato AAAA-MM-DD HH:MM")
  .refine((valor) => parseDateTimeLocal(valor) !== null, "La fecha u hora no existe");

export const productoExperienciaSchema = z.object({
  productoId: z.coerce.number().int().positive(),
  cantidad: z.coerce.number().int().min(1, "La cantidad debe ser al menos 1").max(1000),
});

export const crearExperienciaSchema = z.object({
  nombre: z.string().trim().min(3, "El nombre debe tener al menos 3 caracteres").max(80),
  descripcion: z.string().trim().max(400).optional(),
  espacioId: z.coerce.number().int().positive("Selecciona el espacio"),
  capacidad: z.coerce.number().int().min(1, "La capacidad debe ser al menos 1").max(1000),
  precio: z.coerce.number().int().min(0, "El precio no puede ser negativo").max(10_000_000),
  inicio: datetimeLocalSchema,
  fin: datetimeLocalSchema,
  empleados: z.array(z.coerce.number().int().positive()).max(50).default([]),
  equipos: z.array(z.coerce.number().int().positive()).max(50).default([]),
  productos: z.array(productoExperienciaSchema).max(50).default([]),
});

export const listarExperienciasQuerySchema = z.object({
  estado: z.enum(["programada", "en_curso", "finalizada", "cancelada"]).optional(),
  upcoming: z
    .enum(["true", "false"])
    .default("false")
    .transform((valor) => valor === "true"),
});

export const agregarParticipanteSchema = z.object({
  clienteId: z.coerce.number().int().positive("Selecciona al participante"),
});

export type CrearExperienciaInput = z.infer<typeof crearExperienciaSchema>;
export type ListarExperienciasQuery = z.infer<typeof listarExperienciasQuerySchema>;

/** Convierte "YYYY-MM-DD HH:MM" a Date local, o null si la fecha no existe. */
export function parseDateTimeLocal(valor: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(valor);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  const fecha = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    0,
    0,
  );
  if (
    fecha.getFullYear() !== Number(year) ||
    fecha.getMonth() !== Number(month) - 1 ||
    fecha.getDate() !== Number(day) ||
    fecha.getHours() !== Number(hour) ||
    fecha.getMinutes() !== Number(minute)
  ) {
    return null;
  }
  return fecha;
}

/** Formatea un Date local como "YYYY-MM-DD HH:MM". */
export function formatDateTimeLocal(fecha: Date): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())} ${pad(fecha.getHours())}:${pad(fecha.getMinutes())}`;
}
