import { type Prisma } from "@prisma/client";
import { z } from "zod";

import { PropositoReserva, EstadoReserva, type TipoEspacio, type TipoMembresia } from "@prisma/client";

/**
 * Los horarios se manejan como cadenas "YYYY-MM-DD HH:MM" en hora local del
 * negocio. El formato se valida en el borde y se convierte a Date en el service.
 */
export const datetimeLocalSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/,
    "Usa el formato AAAA-MM-DD HH:MM",
  )
  .refine((valor) => {
    const fecha = parseDateTimeLocal(valor);
    return fecha !== null;
  }, "La fecha u hora no existe");

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

export const propositoSchema = z.nativeEnum(PropositoReserva).refine(
  (valor) => valor !== "evento",
  "Los eventos se crean desde el módulo de experiencias",
);

export const crearReservaSchema = z.object({
  espacioId: z.coerce.number().int().positive("Selecciona el espacio"),
  clienteId: z.coerce.number().int().positive().optional(),
  inicio: datetimeLocalSchema,
  fin: datetimeLocalSchema,
  proposito: propositoSchema,
  notas: z.string().trim().max(240, "Las notas son muy largas").optional(),
});

export const listarReservasQuerySchema = z.object({
  dia: fechaSchema.optional(),
  espacioId: z.coerce.number().int().positive().optional(),
  estado: z.nativeEnum(EstadoReserva).optional(),
});

export const cancelarReservaSchema = z.object({
  estado: z.literal("cancelada"),
});

export type CrearReservaInput = z.infer<typeof crearReservaSchema>;
export type ListarReservasQuery = z.infer<typeof listarReservasQuerySchema>;

/**
 * Convierte "YYYY-MM-DD HH:MM" a Date local. Devuelve null si la fecha no
 * existe (por ejemplo, 30 de febrero).
 */
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
  // Comprobación de round-trip: descarta fechas que el constructor "corrigió".
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

/** Tipos auxiliares para las consultas de Prisma. */
export type { PropositoReserva, EstadoReserva, TipoEspacio, TipoMembresia };
export type ReservaWhere = Prisma.ReservaWhereInput;
