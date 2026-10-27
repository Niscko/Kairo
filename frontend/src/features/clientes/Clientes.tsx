import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { BadgeEstado } from "@/components/ui/badge-estado";
import { Card, CardContent } from "@/components/ui/card";
import { PaginaEncabezado } from "@/components/ui/pagina-encabezado";
import { TablaDatos } from "@/components/ui/tabla-datos";
import { api } from "@/lib/api";
import type { Cliente } from "@/lib/tipos";

export function Clientes() {
  const { t } = useTranslation();

  const { data, isLoading } = useQuery({
    queryKey: ["clientes"],
    queryFn: () => api.get<{ clientes: Cliente[] }>("/api/clientes"),
  });

  const columnas = useMemo<ColumnDef<Cliente, unknown>[]>(
    () => [
      {
        accessorKey: "nombre",
        header: t("common.nombre"),
        cell: ({ row }) => <span className="font-medium">{row.original.nombre}</span>,
      },
      { accessorKey: "email", header: t("common.email") },
      { accessorKey: "telefono", header: t("common.telefono") },
      { accessorKey: "documento", header: t("clientes.documento") },
      {
        accessorKey: "membresia",
        header: t("clientes.membresia"),
        cell: ({ row }) => <BadgeEstado estado={row.original.membresia} />,
      },
      {
        accessorKey: "membresiaVence",
        header: t("clientes.vence"),
        cell: ({ row }) => row.original.membresiaVence ?? "—",
      },
      {
        accessorKey: "activo",
        header: t("common.estado"),
        cell: ({ row }) => <BadgeEstado estado={row.original.activo ? "activo" : "inactivo"} />,
      },
    ],
    [t],
  );

  return (
    <div>
      <PaginaEncabezado titulo={t("nav.clientes")} descripcion={t("clientes.descripcion")} />

      <Card>
        <CardContent className="pt-6">
          <TablaDatos
            columnas={columnas}
            datos={data?.clientes ?? []}
            claveFila={(cliente) => cliente.id}
            cargando={isLoading}
          />
        </CardContent>
      </Card>
    </div>
  );
}
