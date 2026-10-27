import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { Card, CardContent } from "@/components/ui/card";
import { PaginaEncabezado } from "@/components/ui/pagina-encabezado";
import { TablaDatos } from "@/components/ui/tabla-datos";
import { api } from "@/lib/api";
import type { Producto } from "@/lib/tipos";
import { useDato } from "@/i18n/datos";

/** Formatea un monto sin decimales. */
function monto(valor: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(valor);
}

export function Catalogo() {
  const { t } = useTranslation();
  const d = useDato();

  const { data, isLoading } = useQuery({
    queryKey: ["productos"],
    queryFn: () => api.get<{ productos: Producto[] }>("/api/productos?pageSize=100"),
  });

  const columnas = useMemo<ColumnDef<Producto, unknown>[]>(
    () => [
      {
        accessorKey: "nombre",
        header: t("common.nombre"),
        cell: ({ row }) => (
          <div>
            <p className="font-medium">{d(row.original.nombre)}</p>
            {row.original.descripcion && (
              <p className="text-xs text-muted-foreground">{d(row.original.descripcion)}</p>
            )}
          </div>
        ),
      },
      {
        accessorKey: "categoria",
        header: t("catalogo.categoria"),
        cell: ({ row }) => t(`producto.categoria.${row.original.categoria}`),
      },
      {
        accessorKey: "precio",
        header: t("common.precio"),
        cell: ({ row }) => <span className="tabular">{monto(row.original.precio)}</span>,
      },
      {
        accessorKey: "receta",
        header: t("catalogo.receta"),
        cell: ({ row }) =>
          row.original.receta.length === 0 ? (
            "—"
          ) : (
            <span className="text-xs text-muted-foreground">
              {row.original.receta
                .map((item) => `${d(item.insumo)} ${item.cantidad}${item.unidad}`)
                .join(" · ")}
            </span>
          ),
      },
    ],
    [t, d],
  );

  return (
    <div>
      <PaginaEncabezado titulo={t("nav.cafeteria")} descripcion={t("catalogo.descripcion")} />

      <Card>
        <CardContent className="pt-6">
          <TablaDatos
            columnas={columnas}
            datos={data?.productos ?? []}
            claveFila={(producto) => producto.id}
            cargando={isLoading}
          />
        </CardContent>
      </Card>
    </div>
  );
}
