import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { BadgeEstado } from "@/components/ui/badge-estado";
import { Card, CardContent } from "@/components/ui/card";
import { PaginaEncabezado } from "@/components/ui/pagina-encabezado";
import { TablaDatos } from "@/components/ui/tabla-datos";
import { api } from "@/lib/api";
import type { Insumo, Movimiento } from "@/lib/tipos";
import { useDato } from "@/i18n/datos";

export function Inventario() {
  const { t } = useTranslation();
  const d = useDato();

  const { data, isLoading } = useQuery({
    queryKey: ["insumos"],
    queryFn: () => api.get<{ insumos: Insumo[] }>("/api/insumos"),
  });

  const movimientos = useQuery({
    queryKey: ["movimientos"],
    queryFn: () => api.get<{ movimientos: Movimiento[] }>("/api/movimientos?limite=25"),
  });

  const columnas = useMemo<ColumnDef<Insumo, unknown>[]>(
    () => [
      {
        accessorKey: "nombre",
        header: t("common.nombre"),
        cell: ({ row }) => <span className="font-medium">{d(row.original.nombre)}</span>,
      },
      {
        accessorKey: "unidad",
        header: t("inventario.unidad"),
        cell: ({ row }) => d(row.original.unidad),
      },
      {
        accessorKey: "stock",
        header: t("inventario.stock"),
        cell: ({ row }) => (
          <span className="tabular">
            {row.original.stock} {d(row.original.unidad)}
          </span>
        ),
      },
      {
        accessorKey: "stockMinimo",
        header: t("inventario.minimo"),
        cell: ({ row }) => <span className="tabular">{row.original.stockMinimo}</span>,
      },
      {
        accessorKey: "bajoMinimo",
        header: t("common.estado"),
        cell: ({ row }) =>
          row.original.bajoMinimo ? (
            <BadgeEstado estado="vencido" />
          ) : (
            <BadgeEstado estado="vigente" />
          ),
      },
      {
        accessorKey: "proveedor",
        header: t("inventario.proveedor"),
        cell: ({ row }) => d(row.original.proveedor),
      },
    ],
    [t, d],
  );

  const columnasMovimiento = useMemo<ColumnDef<Movimiento, unknown>[]>(
    () => [
      { accessorKey: "fecha", header: t("common.fecha") },
      {
        accessorKey: "insumo",
        header: t("common.nombre"),
        cell: ({ row }) => d(row.original.insumo),
      },
      {
        accessorKey: "tipo",
        header: t("common.estado"),
        cell: ({ row }) => <BadgeEstado estado={row.original.tipo} />,
      },
      {
        accessorKey: "cantidad",
        header: t("common.cantidad"),
        cell: ({ row }) => (
          <span className="tabular">
            {row.original.cantidad} {d(row.original.unidad)}
          </span>
        ),
      },
      {
        accessorKey: "motivo",
        header: t("inventario.motivo"),
        cell: ({ row }) => d(row.original.motivo),
      },
    ],
    [t, d],
  );

  return (
    <div className="space-y-6">
      <PaginaEncabezado titulo={t("nav.inventario")} descripcion={t("inventario.descripcion")} />

      <Card>
        <CardContent className="pt-6">
          <TablaDatos
            columnas={columnas}
            datos={data?.insumos ?? []}
            claveFila={(insumo) => insumo.id}
            cargando={isLoading}
          />
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-3 font-display text-title-lg font-semibold">
          {t("inventario.movimientos")}
        </h2>
        <Card>
          <CardContent className="pt-6">
            <TablaDatos
              columnas={columnasMovimiento}
              datos={movimientos.data?.movimientos ?? []}
              claveFila={(movimiento) => movimiento.id}
              cargando={movimientos.isLoading}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
