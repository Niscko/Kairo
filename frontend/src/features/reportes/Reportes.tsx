import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ContenedorGrafico } from "@/components/ui/grafico";
import { Input, Label } from "@/components/ui/input";import { PaginaEncabezado } from "@/components/ui/pagina-encabezado";
import { SelectCampo } from "@/components/ui/select-campo";
import { TablaDatos } from "@/components/ui/tabla-datos";
import { api } from "@/lib/api";
import { descargarArchivo } from "@/lib/descargas";
import type { RangoReporte, Reporte } from "@/lib/tipos";
import { useDato } from "@/i18n/datos";

/** Formatea un monto en pesos colombianos, sin decimales. */
function monto(valor: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(valor);
}

/** Formatea un monto corto para las etiquetas del eje: 1,2 M. */
function montoCorto(valor: number): string {
  if (Math.abs(valor) >= 1_000_000) return `${(valor / 1_000_000).toFixed(1)} M`;
  if (Math.abs(valor) >= 1_000) return `${(valor / 1_000).toFixed(0)} k`;
  return String(Math.round(valor));
}

/** "YYYY-MM-DD" -> "DD/MM" */
function diaCorto(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

const RANGOS: RangoReporte[] = ["hoy", "7d", "21d", "mes", "custom"];

/** Descargas disponibles, con la clave de traducción y el nombre sugerido. */
const DESCARGAS = [
  { clave: "reportes.descargarReporte", ruta: "reportes.csv", nombre: "reporte.csv" },
  { clave: "reportes.descargarVentas", ruta: "ventas.csv", nombre: "ventas.csv" },
  { clave: "reportes.descargarReservas", ruta: "reservas.csv", nombre: "reservas.csv" },
  { clave: "reportes.descargarInventario", ruta: "inventario.csv", nombre: "inventario.csv" },
] as const;

export function Reportes() {
  const { t } = useTranslation();
  const d = useDato();
  const [rango, setRango] = useState<RangoReporte>("21d");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  const consulta = useMemo(() => {
    const parametros = new URLSearchParams({ rango });
    if (rango === "custom") {
      if (desde) parametros.set("desde", desde);
      if (hasta) parametros.set("hasta", hasta);
    }
    return parametros.toString();
  }, [rango, desde, hasta]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["reportes", consulta],
    queryFn: () => api.get<Reporte>(`/api/reportes?${consulta}`),
    retry: false,
  });

  // El flujo diario lleva la fecha completa; se acorta para las etiquetas.
  const flujo = useMemo(
    () => data?.flujo.map((punto) => ({ ...punto, dia: diaCorto(punto.dia) })) ?? [],
    [data],
  );

  /**
   * Descarga un CSV del período seleccionado. La petición lleva el token en la
   * cabecera, así que no puede ser un enlace simple.
   */
  async function descargar(ruta: string, nombre: string): Promise<void> {
    const consultaCompleta = ruta === "inventario.csv" ? "" : `?${consulta}`;
    try {
      await descargarArchivo(`/api/exportaciones/${ruta}${consultaCompleta}`, nombre);
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <PaginaEncabezado
        titulo={t("nav.reportes")}
        descripcion={data ? t("reportes.periodo", { periodo: d(data.periodo) }) : t("reportes.descripcion")}
        acciones={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Download aria-hidden />
                {t("reportes.descargar")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {DESCARGAS.map((descarga) => (
                <DropdownMenuItem
                  key={descarga.clave}
                  onSelect={() => {
                    void descargar(descarga.ruta, descarga.nombre);
                  }}
                >
                  {t(descarga.clave)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      {/* Selector de período */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 pt-6">
          <SelectCampo
            id="rango"
            name="rango"
            etiqueta={t("reportes.rango")}
            opciones={RANGOS.map((valor) => ({
              valor,
              etiqueta: t(`reportes.rango.${valor}`),
            }))}
            valorControlado={rango}
            onValorCambia={(valor) => setRango(valor as RangoReporte)}
            className="w-48"
          />
          {rango === "custom" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="desde">{t("reportes.desde")}</Label>
                <Input
                  id="desde"
                  type="date"
                  value={desde}
                  onChange={(evento) => setDesde(evento.target.value)}
                  className="w-40"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="hasta">{t("reportes.hasta")}</Label>
                <Input
                  id="hasta"
                  type="date"
                  value={hasta}
                  onChange={(evento) => setHasta(evento.target.value)}
                  className="w-40"
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {isError && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive" role="alert">
          {(error as Error).message}
        </p>
      )}

      {isLoading && <div className="h-64 animate-pulse rounded-lg bg-muted" />}

      {data && (
        <>
          {/* Indicadores */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Indicador
              etiqueta={t("reportes.ingresos")}
              valor={monto(data.ingresos.total)}
              pie={
                <>
                  {t("reportes.ventas")}: {monto(data.ingresos.ventas)}
                </>
              }
              tono="success"
            />
            <Indicador
              etiqueta={t("reportes.egresos")}
              valor={monto(data.egresos.total)}
              pie={
                <>
                  {t("reportes.fijos")}: {monto(data.egresos.fijos)}
                </>
              }
              tono="destructive"
            />
            <Indicador
              etiqueta={t("reportes.margen")}
              valor={monto(data.margenRealizado)}
              pie={t("reportes.ingresosMenosEgresos")}
              tono={data.margenRealizado >= 0 ? "success" : "destructive"}
            />
            <Indicador
              etiqueta={t("reportes.ocupacion")}
              valor={`${data.ocupacionPromedio}%`}
              pie={t("reportes.ocupacionPromedio")}
              tono="default"
            />
          </div>

          {/* Flujo diario */}
          <Card>
            <CardHeader>
              <CardTitle>{t("reportes.flujo")}</CardTitle>
              <CardDescription>{t("reportes.flujoDescripcion")}</CardDescription>
            </CardHeader>
            <CardContent>
              <ContenedorGrafico alto="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={flujo} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                    <XAxis dataKey="dia" tick={{ fontSize: 11 }} className="stroke-border" />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      tickFormatter={montoCorto}
                      className="stroke-border"
                      width={52}
                    />
                    <Tooltip
                      formatter={(valor) => monto(Number(valor ?? 0))}
                      contentStyle={{
                        background: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "0.5rem",
                        fontSize: "0.8rem",
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="ingresos"
                      name={t("reportes.ingresos")}
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="egresos"
                      name={t("reportes.egresos")}
                      stroke="hsl(var(--destructive))"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </ContenedorGrafico>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Demanda por hora */}
            <Card>
              <CardHeader>
                <CardTitle>{t("reportes.demanda")}</CardTitle>
                <CardDescription>{t("reportes.demandaDescripcion")}</CardDescription>
              </CardHeader>
              <CardContent>
                <ContenedorGrafico>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.demanda} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                      <XAxis
                        dataKey="hora"
                        tick={{ fontSize: 11 }}
                        className="stroke-border"
                        tickFormatter={(hora: number) => `${hora}h`}
                      />
                      <YAxis tick={{ fontSize: 11 }} className="stroke-border" width={32} />
                      <Tooltip
                        contentStyle={{
                          background: "hsl(var(--popover))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "0.5rem",
                          fontSize: "0.8rem",
                        }}
                      />
                      <Bar dataKey="reservas" name={t("reportes.reservas")} fill="hsl(var(--primary))" />
                      <Bar dataKey="ventas" name={t("reportes.ventas")} fill="hsl(var(--secondary))" />
                    </BarChart>
                  </ResponsiveContainer>
                </ContenedorGrafico>
              </CardContent>
            </Card>

            {/* Utilización */}
            <Card>
              <CardHeader>
                <CardTitle>{t("reportes.utilizacion")}</CardTitle>
                <CardDescription>{t("reportes.utilizacionDescripcion")}</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="max-h-64 space-y-2 overflow-y-auto">
                  {data.utilizacion
                    .filter((item) => item.horas > 0)
                    .map((item) => (
                      <li key={item.id} className="flex items-center gap-3 text-sm">
                        <span className="w-32 shrink-0 truncate">{d(item.nombre)}</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${Math.min(100, item.porcentaje)}%` }}
                          />
                        </div>
                        <span className="w-14 shrink-0 text-right tabular text-muted-foreground">
                          {item.porcentaje}%
                        </span>
                      </li>
                    ))}
                  {data.utilizacion.every((item) => item.horas === 0) && (
                    <p className="text-sm text-muted-foreground">{t("common.sinResultados")}</p>
                  )}
                </ul>
              </CardContent>
            </Card>
          </div>

          {/* Top de productos */}
          <Card>
            <CardHeader>
              <CardTitle>{t("reportes.topProductos")}</CardTitle>
              <CardDescription>{t("reportes.topProductosDescripcion")}</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {data.topProductos.map((producto) => {
                  const maximo = data.topProductos[0]?.ingresos ?? 1;
                  return (
                    <li key={producto.id} className="flex items-center gap-3 text-sm">
                      <span className="w-32 shrink-0 truncate font-medium">{d(producto.nombre)}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${(producto.ingresos / maximo) * 100}%` }}
                        />
                      </div>
                      <span className="w-24 shrink-0 text-right tabular text-muted-foreground">
                        {monto(producto.ingresos)}
                      </span>
                      <span className="w-16 shrink-0 text-right tabular text-xs text-muted-foreground">
                        ×{producto.cantidad}
                      </span>
                    </li>
                  );
                })}
                {data.topProductos.length === 0 && (
                  <p className="text-sm text-muted-foreground">{t("common.sinResultados")}</p>
                )}
              </ul>
            </CardContent>
          </Card>

          {/* Detalle de egresos */}
          <Card>
            <CardHeader>
              <CardTitle>{t("reportes.detalleEgresos")}</CardTitle>
              <CardDescription>{t("reportes.detalleEgresosDescripcion")}</CardDescription>
            </CardHeader>
            <CardContent>
              <TablaDatos
                columnas={columnasEgresos(t, d)}
                datos={data.egresos.detalle}
                claveFila={(costo) => costo.id}
                mensajeVacio={t("common.sinResultados")}
              />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Indicador({
  etiqueta,
  valor,
  pie,
  tono,
}: {
  etiqueta: string;
  valor: string;
  pie: React.ReactNode;
  tono: "default" | "success" | "destructive";
}) {
  const color =
    tono === "success"
      ? "text-success"
      : tono === "destructive"
        ? "text-destructive"
        : "text-foreground";

  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-sm text-muted-foreground">{etiqueta}</p>
        <p className={`mt-2 font-display text-2xl font-semibold tabular ${color}`}>{valor}</p>
        <p className="mt-1 text-xs text-muted-foreground">{pie}</p>
      </CardContent>
    </Card>
  );
}

function columnasEgresos(t: (clave: string) => string, d: (valor: string | null | undefined) => string) {
  return [
    {
      accessorKey: "concepto",
      header: t("reportes.concepto"),
      cell: ({ row }: { row: { original: Reporte["egresos"]["detalle"][number] } }) => (
        <span className="font-medium">{d(row.original.concepto)}</span>
      ),
    },
    {
      accessorKey: "categoria",
      header: t("reportes.categoria"),
      cell: ({ row }: { row: { original: Reporte["egresos"]["detalle"][number] } }) =>
        d(row.original.categoria),
    },
    {
      accessorKey: "monto",
      header: t("reportes.monto"),
      cell: ({ row }: { row: { original: Reporte["egresos"]["detalle"][number] } }) => (
        <span className="tabular">{monto(row.original.monto)}</span>
      ),
    },
    {
      accessorKey: "prorrateado",
      header: t("reportes.prorrateado"),
      cell: ({ row }: { row: { original: Reporte["egresos"]["detalle"][number] } }) => (
        <span className="tabular font-medium">{monto(row.original.prorrateado)}</span>
      ),
    },
    {
      accessorKey: "estado",
      header: t("common.estado"),
      cell: ({ row }: { row: { original: Reporte["egresos"]["detalle"][number] } }) => (
        <Badge variant={row.original.estado === "pagado" ? "success" : "warning"}>
          {t(`status.${row.original.estado}`)}
        </Badge>
      ),
    },
  ];
}
