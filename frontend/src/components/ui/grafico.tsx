import { cn } from "@/lib/utils";

/**
 * Contenedor de gráfico con estado vacío.
 *
 * Recharts necesita un contenedor con altura definida para calcular el área
 * de dibujo: sin alto explícito, el gráfico se renderiza plano.
 */
export function ContenedorGrafico({
  alto = "h-64",
  children,
  className,
}: {
  alto?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("w-full", alto, className)}>{children}</div>;
}
