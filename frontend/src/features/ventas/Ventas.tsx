import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { Card, CardContent } from "@/components/ui/card";
import { PaginaEncabezado } from "@/components/ui/pagina-encabezado";
import { TablaDatos } from "@/components/ui/tabla-datos";
import { api } from "@/lib/api";
import type { Venta } from "@/lib/tipos";
import { useDato } from "@/i18n/datos";

/** Formatea un monto sin decimales. */
function monto(valor: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(valor);
}

export function Ventas() {
  const { t } = useTranslation();
  const d = useDato();

  const { data, isLoading } = useQuery({
    queryKey: ["ventas"],
    queryFn: () => api.get<{ ventas: Venta[] }>("/api/ventas?limite=50"),
  });

  const columnas = useMemo<ColumnDef<Venta, unknown>[]>(
    () => [
      { accessorKey: "fecha", header: t("common.fecha") },
      {
        accessorKey: "items",
        header: t("ventas.productos"),
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {row.original.items
              .map((item) => `${item.cantidad}× ${d(item.producto)}`)
              .join(" · ")}
          </span>
        ),
      },
      { accessorKey: "cliente", header: t("ventas.cliente") },
      { accessorKey: "empleado", header: t("ventas.empleado") },
      {
        accessorKey: "metodoPago",
        header: t("ventas.metodo"),
        cell: ({ row }) => t(`metodo.${row.original.metodoPago}`),
      },
      {
        accessorKey: "total",
        header: t("common.total"),
        cell: ({ row }) => <span className="tabular font-medium">{monto(row.original.total)}</span>,
      },
    ],
    [t, d],
  );

  return (
    <div>
      <PaginaEncabezado titulo={t("nav.ventas")} descripcion={t("ventas.descripcion")} />

      <Card>
        <CardContent className="pt-6">
          <TablaDatos
            columnas={columnas}
            datos={data?.ventas ?? []}
            claveFila={(venta) => venta.id}
            cargando={isLoading}
          />
        </CardContent>
      </Card>
    </div>
  );
}
