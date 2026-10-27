import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { Card, CardContent } from "@/components/ui/card";
import { PaginaEncabezado } from "@/components/ui/pagina-encabezado";
import { TablaDatos } from "@/components/ui/tabla-datos";
import { api } from "@/lib/api";
import type { Empleado } from "@/lib/tipos";
import { useDato } from "@/i18n/datos";

/** Formatea un monto sin decimales. */
function monto(valor: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(valor);
}

export function Personas() {
  const { t } = useTranslation();
  const d = useDato();

  const { data, isLoading } = useQuery({
    queryKey: ["empleados"],
    queryFn: () => api.get<{ empleados: Empleado[] }>("/api/empleados"),
  });

  const columnas = useMemo<ColumnDef<Empleado, unknown>[]>(
    () => [
      {
        accessorKey: "nombre",
        header: t("common.nombre"),
        cell: ({ row }) => <span className="font-medium">{row.original.nombre}</span>,
      },
      {
        accessorKey: "cargo",
        header: t("personas.cargo"),
        cell: ({ row }) => d(row.original.cargo),
      },
      { accessorKey: "email", header: t("common.email") },
      { accessorKey: "telefono", header: t("common.telefono") },
      { accessorKey: "fechaIngreso", header: t("personas.ingreso") },
      {
        accessorKey: "salario",
        header: t("personas.salario"),
        // El backend solo incluye el salario para la dirección.
        cell: ({ row }) =>
          row.original.salario === undefined ? "—" : <span className="tabular">{monto(row.original.salario)}</span>,
      },
    ],
    [t, d],
  );

  return (
    <div>
      <PaginaEncabezado titulo={t("nav.personas")} descripcion={t("personas.descripcion")} />

      <Card>
        <CardContent className="pt-6">
          <TablaDatos
            columnas={columnas}
            datos={data?.empleados ?? []}
            claveFila={(empleado) => empleado.id}
            cargando={isLoading}
          />
        </CardContent>
      </Card>
    </div>
  );
}
