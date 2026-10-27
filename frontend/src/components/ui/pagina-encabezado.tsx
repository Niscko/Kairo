import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Cabecera de página: título, descripción y acciones a la derecha.
 */
export function PaginaEncabezado({
  titulo,
  descripcion,
  acciones,
  className,
}: {
  titulo: string;
  descripcion?: string;
  acciones?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-6 flex flex-wrap items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        <h1 className="font-display text-display-md font-semibold tracking-tight">{titulo}</h1>
        {descripcion && <p className="mt-1 text-sm text-muted-foreground">{descripcion}</p>}
      </div>
      {acciones && <div className="flex shrink-0 items-center gap-2">{acciones}</div>}
    </div>
  );
}
