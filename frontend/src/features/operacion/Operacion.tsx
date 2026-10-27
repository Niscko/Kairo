import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { BadgeEstado } from "@/components/ui/badge-estado";
import { Card, CardContent } from "@/components/ui/card";
import { PaginaEncabezado } from "@/components/ui/pagina-encabezado";
import { TablaDatos } from "@/components/ui/tabla-datos";
import { api } from "@/lib/api";
import type { Costo, Permiso } from "@/lib/tipos";
import { useDato } from "@/i18n/datos";

/** Formatea un monto sin decimales. */
function monto(valor: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(valor);
}

export function Operacion() {
  const { t } = useTranslation();
  const d = useDato();

  const costos = useQuery({
    queryKey: ["costos"],
    queryFn: () => api.get<{ costos: Costo[] }>("/api/costos"),
  });

  const permisos = useQuery({
    queryKey: ["permisos"],
    queryFn: () => api.get<{ permisos: Permiso[] }>("/api/permisos"),
  });

  const columnasCostos = useMemo<ColumnDef<Costo, unknown>[]>(
    () => [
      {
        accessorKey: "concepto",
        header: t("operacion.concepto"),
        cell: ({ row }) => <span className="font-medium">{d(row.original.concepto)}</span>,
      },
      {
        accessorKey: "categoria",
        header: t("operacion.categoria"),
        cell: ({ row }) => d(row.original.categoria),
      },
      {
        accessorKey: "monto",
        header: t("common.total"),
        cell: ({ row }) => <span className="tabular">{monto(row.original.monto)}</span>,
      },
      { accessorKey: "periodo", header: t("operacion.periodo") },
      { accessorKey: "vencimiento", header: t("common.fecha") },
      {
        accessorKey: "estado",
        header: t("common.estado"),
        cell: ({ row }) => <BadgeEstado estado={row.original.estado} />,
      },
    ],
    [t, d],
  );

  const columnasPermisos = useMemo<ColumnDef<Permiso, unknown>[]>(
    () => [
      {
        accessorKey: "nombre",
        header: t("common.nombre"),
        cell: ({ row }) => <span className="font-medium">{d(row.original.nombre)}</span>,
      },
      {
        accessorKey: "entidad",
        header: t("operacion.entidad"),
        cell: ({ row }) => d(row.original.entidad),
      },
      { accessorKey: "numero", header: t("operacion.numero") },
      { accessorKey: "vencimiento", header: t("common.fecha") },
      {
        accessorKey: "estado",
        header: t("common.estado"),
        cell: ({ row }) => <BadgeEstado estado={row.original.estado} />,
      },
    ],
    [t, d],
  );

  const totalPendiente =
    costos.data?.costos
      .filter((costo) => costo.estado === "pendiente")
      .reduce((suma, costo) => suma + costo.monto, 0) ?? 0;

  return (
    <div className="space-y-6">
      <PaginaEncabezado titulo={t("nav.operacion")} descripcion={t("operacion.descripcion")} />

      <Card>
        <CardContent className="pt-6">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-display text-title-lg font-semibold">{t("operacion.costos")}</h2>
            <p className="text-sm text-muted-foreground">
              {t("operacion.pendiente")}: <span className="tabular">{monto(totalPendiente)}</span>
            </p>
          </div>
          <TablaDatos
            columnas={columnasCostos}
            datos={costos.data?.costos ?? []}
            claveFila={(costo) => costo.id}
            cargando={costos.isLoading}
          />
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-3 font-display text-title-lg font-semibold">
          {t("operacion.permisos")}
        </h2>
        <Card>
          <CardContent className="pt-6">
            <TablaDatos
              columnas={columnasPermisos}
              datos={permisos.data?.permisos ?? []}
              claveFila={(permiso) => permiso.id}
              cargando={permisos.isLoading}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
