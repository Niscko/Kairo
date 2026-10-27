import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combina clases condicionales y resuelve los conflictos de Tailwind.
 *
 * `clsx` decide qué clases existen; `twMerge` descarta las que se contradicen
 * (`px-2 px-4` -> `px-4`). Sin el segundo paso, el orden del objeto importando
 * variantes elegiría el estilo equivocado.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}