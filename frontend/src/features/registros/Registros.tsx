import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { BadgeEstado } from "@/components/ui/badge-estado";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PaginaEncabezado } from "@/components/ui/pagina-encabezado";
import { TablaDatos } from "@/components/ui/tabla-datos";
import { api } from "@/lib/api";
import type { AccionRegistro, Paginado, RegistroActividad } from "@/lib/tipos";

const FILTROS: Array<"" | AccionRegistro> = ["", "crear", "actualizar", "eliminar"];

const VARIANTE: Record<AccionRegistro, "success" | "warning" | "destructive"> = {
  crear: "success",
  actualizar: "warning",
  eliminar: "destructive",
};

/** Texto corto para reconocer qué se tocó, sin mostrar datos sensibles. */
function detalleVisible(
  registro: RegistroActividad,
  t: (clave: string, opciones?: { defaultValue?: string }) => string,
): string {
  const detalle = registro.detalle ?? {};
  const entidad = t(`registros.entidad.${registro.entidad}`, { defaultValue: registro.entidad });
  const subrecurso =
    typeof detalle.subrecurso === "string"
      ? t(`registros.sub.${detalle.subrecurso}`, { defaultValue: detalle.subrecurso })
      : "";
  const nombre =
    texto(detalle.nombre) ??
    texto(detalle.email) ??
    texto(detalle.concepto) ??
    texto(detalle.motivo) ??
    (registro.entidadId ? `#${registro.entidadId}` : "");

  return [entidad, subrecurso, nombre].filter((parte) => parte.length > 0).join(" · ");
}

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor.length > 0 ? valor : null;
}

export function Registros() {
  const { t, i18n } = useTranslation();
  const [filtro, setFiltro] = useState<"" | AccionRegistro>("");

  const consulta = useQuery({
    queryKey: ["registros", filtro],
    queryFn: () => {
      const params = new URLSearchParams({ pageSize: "100" });
      if (filtro) params.set("accion", filtro);
      return api.get<Paginado<RegistroActividad>>(`/api/registros?${params.toString()}`);
    },
  });

  const fecha = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    [i18n.language],
  );

  const columnas = useMemo<ColumnDef<RegistroActividad, unknown>[]>(
    () => [
      {
        accessorKey: "creadoEn",
        header: t("registros.cuando"),
        cell: ({ row }) => (
          <span className="tabular whitespace-nowrap">
            {fecha.format(new Date(row.original.creadoEn))}
          </span>
        ),
      },
      {
        accessorKey: "actorNombre",
        header: t("registros.quien"),
        cell: ({ row }) => (
          <span className="block">
            <span className="font-medium">{row.original.actorNombre}</span>
            <span className="block text-xs text-muted-foreground">{row.original.actorEmail}</span>
          </span>
        ),
      },
      {
        accessorKey: "accion",
        header: t("registros.accion"),
        cell: ({ row }) => (
          <Badge variant={VARIANTE[row.original.accion]}>
            {t(`registros.accion.${row.original.accion}`)}
          </Badge>
        ),
      },
      {
        id: "detalle",
        header: t("registros.detalle"),
        cell: ({ row }) => {
          const detalle = row.original.detalle ?? {};
          const estado = typeof detalle.estado === "string" ? detalle.estado : null;
          const activo = typeof detalle.activo === "boolean" ? detalle.activo : null;
          return (
            <span className="flex flex-wrap items-center gap-2">
              <span>{detalleVisible(row.original, t)}</span>
              {estado && <BadgeEstado estado={estado} />}
              {activo !== null && <BadgeEstado estado={activo ? "activo" : "inactivo"} />}
            </span>
          );
        },
      },
    ],
    [fecha, t],
  );

  return (
    <div className="space-y-6">
      <PaginaEncabezado
        titulo={t("registros.titulo")}
        descripcion={t("registros.descripcion")}
        acciones={
          <div className="flex flex-wrap gap-2" role="group" aria-label={t("common.filtrar")}>
            {FILTROS.map((valor) => (
              <Button
                key={valor || "todas"}
                type="button"
                size="sm"
                variant={filtro === valor ? "default" : "outline"}
                aria-pressed={filtro === valor}
                onClick={() => setFiltro(valor)}
              >
                {t(valor ? `registros.filtro.${valor}` : "registros.filtro.todas")}
              </Button>
            ))}
          </div>
        }
      />

      {consulta.isError && <p className="text-sm text-destructive">{t("common.error")}</p>}

      <Card>
        <CardContent className="pt-6">
          <TablaDatos
            columnas={columnas}
            datos={consulta.data?.datos ?? []}
            claveFila={(fila) => fila.id}
            cargando={consulta.isLoading}
            mensajeVacio={t("registros.vacio")}
          />
        </CardContent>
      </Card>
    </div>
  );
}
