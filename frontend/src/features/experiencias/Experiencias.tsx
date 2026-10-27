import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { BadgeEstado } from "@/components/ui/badge-estado";
import { Card, CardContent } from "@/components/ui/card";
import { PaginaEncabezado } from "@/components/ui/pagina-encabezado";
import { TablaDatos } from "@/components/ui/tabla-datos";
import { api } from "@/lib/api";
import type { Experiencia } from "@/lib/tipos";
import { useDato } from "@/i18n/datos";

/** Formatea un monto sin decimales. */
function monto(valor: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(valor);
}

/** "YYYY-MM-DD HH:MM" -> "DD/MM HH:MM" */
function fechaCorta(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)} ${iso.slice(11, 16)}`;
}

export function Experiencias() {
  const { t } = useTranslation();
  const d = useDato();

  const { data, isLoading } = useQuery({
    queryKey: ["experiencias"],
    queryFn: () => api.get<{ experiencias: Experiencia[] }>("/api/experiencias"),
  });

  const columnas = useMemo<ColumnDef<Experiencia, unknown>[]>(
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
        accessorKey: "espacio",
        header: t("experiencias.espacio"),
        cell: ({ row }) => d(row.original.espacio),
      },
      {
        accessorKey: "inicio",
        header: t("common.fecha"),
        cell: ({ row }) => (
          <span className="tabular text-xs">
            {fechaCorta(row.original.inicio)} – {fechaCorta(row.original.fin)}
          </span>
        ),
      },
      {
        accessorKey: "capacidad",
        header: t("experiencias.capacidad"),
        cell: ({ row }) => (
          <span className="tabular">
            {row.original.participantes}/{row.original.capacidad}
          </span>
        ),
      },
      {
        accessorKey: "precio",
        header: t("common.precio"),
        cell: ({ row }) => <span className="tabular">{monto(row.original.precio)}</span>,
      },
      {
        accessorKey: "estado",
        header: t("common.estado"),
        cell: ({ row }) => <BadgeEstado estado={row.original.estado} />,
      },
    ],
    [t, d],
  );

  return (
    <div>
      <PaginaEncabezado titulo={t("nav.experiencias")} descripcion={t("experiencias.descripcion")} />

      <Card>
        <CardContent className="pt-6">
          <TablaDatos
            columnas={columnas}
            datos={data?.experiencias ?? []}
            claveFila={(experiencia) => experiencia.id}
            cargando={isLoading}
          />
        </CardContent>
      </Card>
    </div>
  );
}
