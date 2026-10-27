import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { Card, CardContent } from "@/components/ui/card";
import { PaginaEncabezado } from "@/components/ui/pagina-encabezado";
import { TablaDatos } from "@/components/ui/tabla-datos";
import { api } from "@/lib/api";
import type { Turno } from "@/lib/tipos";

export function Turnos() {
  const { t } = useTranslation();

  const { data, isLoading } = useQuery({
    queryKey: ["turnos"],
    queryFn: () => api.get<{ fecha: string; turnos: Turno[] }>("/api/turnos"),
  });

  const columnas = useMemo<ColumnDef<Turno, unknown>[]>(
    () => [
      {
        accessorKey: "horaInicio",
        header: t("turnos.horario"),
        cell: ({ row }) => (
          <span className="tabular font-medium">
            {row.original.horaInicio}–{row.original.horaFin}
          </span>
        ),
      },
      {
        accessorKey: "nombre",
        header: t("common.nombre"),
        cell: ({ row }) => (
          <div>
            <p className="font-medium">{row.original.nombre}</p>
            <p className="text-xs text-muted-foreground">{row.original.cargo}</p>
          </div>
        ),
      },
      { accessorKey: "area", header: t("turnos.area") },
    ],
    [t],
  );

  return (
    <div>
      <PaginaEncabezado
        titulo={t("nav.turnos")}
        descripcion={t("turnos.descripcion", { fecha: data?.fecha ?? "" })}
      />

      <Card>
        <CardContent className="pt-6">
          <TablaDatos
            columnas={columnas}
            datos={data?.turnos ?? []}
            claveFila={(turno) => turno.id}
            cargando={isLoading}
          />
        </CardContent>
      </Card>
    </div>
  );
}
