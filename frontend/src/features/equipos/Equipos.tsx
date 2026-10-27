import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { BadgeEstado } from "@/components/ui/badge-estado";
import { Card, CardContent } from "@/components/ui/card";
import { PaginaEncabezado } from "@/components/ui/pagina-encabezado";
import { TablaDatos } from "@/components/ui/tabla-datos";
import { api } from "@/lib/api";
import type { Equipo } from "@/lib/tipos";
import { useDato } from "@/i18n/datos";

/** Formatea un monto sin decimales. */
function monto(valor: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(valor);
}

export function Equipos() {
  const { t } = useTranslation();
  const d = useDato();

  const { data, isLoading } = useQuery({
    queryKey: ["equipos"],
    queryFn: () => api.get<{ equipos: Equipo[] }>("/api/equipos"),
  });

  const columnas = useMemo<ColumnDef<Equipo, unknown>[]>(
    () => [
      {
        accessorKey: "nombre",
        header: t("common.nombre"),
        cell: ({ row }) => <span className="font-medium">{d(row.original.nombre)}</span>,
      },
      {
        accessorKey: "tipo",
        header: t("equipos.tipo"),
        cell: ({ row }) => t(`equipo.tipo.${row.original.tipo}`),
      },
      {
        accessorKey: "estado",
        header: t("common.estado"),
        cell: ({ row }) => <BadgeEstado estado={row.original.estado} />,
      },
      {
        accessorKey: "espacio",
        header: t("equipos.ubicacion"),
        cell: ({ row }) => d(row.original.espacio),
      },
      {
        accessorKey: "costo",
        header: t("equipos.costo"),
        cell: ({ row }) => <span className="tabular">{monto(row.original.costo)}</span>,
      },
    ],
    [t, d],
  );

  return (
    <div>
      <PaginaEncabezado titulo={t("nav.equipos")} descripcion={t("equipos.descripcion")} />

      <Card>
        <CardContent className="pt-6">
          <TablaDatos
            columnas={columnas}
            datos={data?.equipos ?? []}
            claveFila={(equipo) => equipo.id}
            cargando={isLoading}
          />
        </CardContent>
      </Card>
    </div>
  );
}
