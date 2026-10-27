import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface Props<T> {
  columnas: ColumnDef<T, unknown>[];
  datos: T[];
  /** Clave única de cada fila. */
  claveFila: (fila: T) => string | number;
  cargando?: boolean;
  mensajeVacio?: string;
  /** Oculta la paginación cuando la tabla muestra pocos elementos. */
  paginar?: boolean;
  /**
   * Fila que se fija al principio de la tabla. Se usa tras crear un registro
   * para que el usuario vea de inmediato lo que acaba de crear, aunque la
   * tabla esté paginada.
   */
  destacado?: string | number | null;
}

/**
 * Tabla de datos sobre TanStack Table: orden por columna, filtro global y
 * paginación en el cliente.
 *
 * Los datos ya vienen paginados del servidor cuando el módulo lo necesita;
 * en ese caso se pasa `paginar={false}` y el filtrado local se limita.
 */
export function TablaDatos<T>({
  columnas,
  datos,
  claveFila,
  cargando = false,
  mensajeVacio = "Sin resultados",
  paginar = true,
  destacado = null,
}: Props<T>) {
  const [orden, setOrden] = useState<SortingState>([]);
  const [filtro, setFiltro] = useState("");

  // La fila destacada se separa del resto para fijarla arriba.
  const filasOrdenadas = useMemo(() => {
    if (destacado === null) return datos;
    const fijada = datos.find((dato) => claveFila(dato) === destacado);
    if (!fijada) return datos;
    return [fijada, ...datos.filter((dato) => claveFila(dato) !== destacado)];
  }, [datos, destacado, claveFila]);

  const tabla = useReactTable({
    data: filasOrdenadas,
    columns: columnas,
    state: { sorting: orden, globalFilter: filtro },
    onSortingChange: setOrden,
    onGlobalFilterChange: setFiltro,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: paginar ? getPaginationRowModel() : undefined,
    initialState: { pagination: { pageSize: 12 } },
    globalFilterFn: "includesString",
  });

  const filas = tabla.getRowModel().rows;
  const paginacion = tabla.getState().pagination;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <input
          type="search"
          value={filtro}
          onChange={(evento) => setFiltro(evento.target.value)}
          placeholder="Buscar…"
          aria-label="Buscar"
          className="h-9 w-full max-w-xs rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        />
        {!cargando && (
          <p className="text-xs text-muted-foreground">
            {tabla.getFilteredRowModel().rows.length} resultado
            {tabla.getFilteredRowModel().rows.length === 1 ? "" : "s"}
          </p>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            {tabla.getHeaderGroups().map((grupo) => (
              <TableRow key={grupo.id}>
                {grupo.headers.map((encabezado) => {
                  const ordenable = encabezado.column.getCanSort();
                  const direccion = encabezado.column.getIsSorted();
                  return (
                    <TableHead key={encabezado.id}>
                      {encabezado.isPlaceholder ? null : (
                        <button
                          type="button"
                          onClick={encabezado.column.getToggleSortingHandler()}
                          className={cn(
                            "inline-flex items-center gap-1.5 transition-colors hover:text-foreground",
                            ordenable ? "cursor-pointer" : "cursor-default",
                            direccion && "text-foreground",
                          )}
                          disabled={!ordenable}
                        >
                          {flexRender(encabezado.column.columnDef.header, encabezado.getContext())}
                          {ordenable &&
                            (direccion === "asc" ? (
                              <ArrowUp className="size-3.5" aria-hidden />
                            ) : direccion === "desc" ? (
                              <ArrowDown className="size-3.5" aria-hidden />
                            ) : (
                              <ArrowUpDown className="size-3.5 opacity-40" aria-hidden />
                            ))}
                        </button>
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {cargando ? (
              <TableRow>
                <TableCell
                  colSpan={columnas.length}
                  className="h-24 text-center text-sm text-muted-foreground"
                >
                  Cargando…
                </TableCell>
              </TableRow>
            ) : filas.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columnas.length}
                  className="h-24 text-center text-sm text-muted-foreground"
                >
                  {mensajeVacio}
                </TableCell>
              </TableRow>
            ) : (
              filas.map((fila) => {
                const original = fila.original as T;
                return (
                  <TableRow key={claveFila(original)}>
                    {fila.getVisibleCells().map((celda) => (
                      <TableCell key={celda.id}>
                        {flexRender(celda.column.columnDef.cell, celda.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {paginar && tabla.getPageCount() > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Página {paginacion.pageIndex + 1} de {tabla.getPageCount()}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => tabla.previousPage()}
              disabled={!tabla.getCanPreviousPage()}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => tabla.nextPage()}
              disabled={!tabla.getCanNextPage()}
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
