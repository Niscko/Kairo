import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarClock,
  CircleDollarSign,
  Coffee,
  Package,
  TrendingUp,
  Users,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { BadgeEstado } from "@/components/ui/badge-estado";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PaginaEncabezado } from "@/components/ui/pagina-encabezado";
import { Progress } from "@/components/ui/progress";
import { useSesion } from "@/features/auth/Sesion";
import { api } from "@/lib/api";
import type { Dashboard as DashboardDTO } from "@/lib/tipos";
import { useDato } from "@/i18n/datos";

/** Formatea un monto en pesos colombianos, sin decimales. */
function monto(valor: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(valor);
}

/** Formatea "YYYY-MM-DD HH:MM" como hora corta local. */
function hora(iso: string): string {
  return iso.slice(11, 16);
}

export function Dashboard() {
  const { t } = useTranslation();
  const d = useDato();
  const { usuario } = useSesion();

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.get<DashboardDTO>("/api/dashboard"),
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <div className="h-9 w-48 animate-pulse rounded-md bg-muted" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, indice) => (
            <div key={indice} className="h-28 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  const totalEspacios = data.espacios.length;
  const porcentajeOcupacion =
    totalEspacios === 0 ? 0 : Math.round((data.ocupados / totalEspacios) * 100);
  const maxSerie = Math.max(...data.serie.map((punto) => punto.total), 1);

  return (
    <div className="space-y-6">
      <PaginaEncabezado
        titulo={t("nav.dashboard")}
        descripcion={t("dash.saludo", { nombre: usuario?.nombre ?? "" })}
      />

      {/* Indicadores principales */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <TarjetaIndicador
          icono={Coffee}
          etiqueta={t("dash.ventasHoy")}
          valor={monto(data.ventasHoy.total)}
          pie={`${data.ventasHoy.operaciones} ${t("dash.operaciones")}`}
        />
        <TarjetaIndicador
          icono={Users}
          etiqueta={t("dash.ocupacion")}
          valor={`${data.ocupados}/${totalEspacios}`}
          pie={`${porcentajeOcupacion}% ${t("dash.delTotal")}`}
          progreso={porcentajeOcupacion}
        />
        {data.consumoMes !== undefined ? (
          <TarjetaIndicador
            icono={CircleDollarSign}
            etiqueta={t("dash.consumoMes")}
            valor={monto(data.consumoMes)}
            pie={t("dash.tuCuenta")}
          />
        ) : (
          <TarjetaIndicador
            icono={Package}
            etiqueta={t("dash.stockBajo")}
            valor={String(data.stock.length)}
            pie={t("dash.necesitanReposicion")}
          />
        )}
        {data.costosPendientesTotal !== undefined && (
          <TarjetaIndicador
            icono={TrendingUp}
            etiqueta={t("dash.costosPendientes")}
            valor={monto(data.costosPendientesTotal)}
            pie={`${data.costosPendientes?.length ?? 0} ${t("dash.sinPagar")}`}
          />
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Serie de ventas */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("dash.ultimosDias")}</CardTitle>
            <CardDescription>{t("dash.ventasPorDia")}</CardDescription>
          </CardHeader>
          <CardContent>
            {/* Cada barra se dibuja dentro de una columna de altura fija: el
                porcentaje de altura necesita un padre con tamaño explícito. */}
            <div className="flex h-40 items-end gap-2">
              {data.serie.map((punto) => (
                <div
                  key={punto.dia}
                  className="group flex h-full flex-1 flex-col items-center justify-end gap-2"
                >
                  <span className="text-xs font-medium tabular text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                    {monto(punto.total)}
                  </span>
                  <div
                    className="w-full rounded-t bg-primary/80 transition-colors group-hover:bg-primary"
                    style={{ height: `${Math.max(4, (punto.total / maxSerie) * 100)}%` }}
                    title={`${punto.dia}: ${monto(punto.total)}`}
                  />
                  <span className="text-[10px] text-muted-foreground">
                    {punto.dia.slice(8)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Ocupación de espacios */}
        <Card>
          <CardHeader>
            <CardTitle>{t("dash.espacios")}</CardTitle>
            <CardDescription>{t("dash.presenciaAhora")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {data.espacios.slice(0, 8).map((espacio) => (
                <li key={espacio.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{d(espacio.nombre)}</span>
                  <BadgeEstado estado={espacio.presencia === "ocupado" ? "ocupado" : "libre"} />
                </li>
              ))}
            </ul>
            {data.espacios.length > 8 && (
              <Button asChild variant="link" size="sm" className="mt-2 px-0">
                <Link to="/espacios">{t("common.verTodos")}</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Próximas reservas */}
        <Card>
          <CardHeader>
            <CardTitle>{t("dash.proximasReservas")}</CardTitle>
            <CardDescription>{t("dash.agendaLocal")}</CardDescription>
          </CardHeader>
          <CardContent>
            {data.reservas.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("common.sinResultados")}</p>
            ) : (
              <ul className="space-y-3">
                {data.reservas.map((reserva) => (
                  <li key={reserva.id} className="flex items-start gap-3 text-sm">
                    <CalendarClock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{d(reserva.espacio)}</p>
                      <p className="text-xs text-muted-foreground">
                        {hora(reserva.inicio)}–{hora(reserva.fin)}
                        {reserva.cliente && ` · ${reserva.cliente}`}
                      </p>
                    </div>
                    <BadgeEstado estado={reserva.estado} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Turnos de hoy */}
        {data.turnos.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>{t("dash.turnosHoy")}</CardTitle>
              <CardDescription>{t("dash.quienEstaHoy")}</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {data.turnos.map((turno) => (
                  <li key={turno.id} className="flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{turno.nombre}</p>
                      <p className="text-xs text-muted-foreground">{d(turno.area)}</p>
                    </div>
                    <span className="shrink-0 tabular text-muted-foreground">
                      {turno.horaInicio}–{turno.horaFin}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Avisos */}
      {(data.stock.length > 0 || data.permisos.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-warning" aria-hidden />
              {t("dash.avisos")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.stock.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-medium">{t("dash.insumosBajoMinimo")}</p>
                <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {data.stock.map((insumo) => (
                    <li
                      key={insumo.id}
                      className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
                    >
                      <span className="truncate">{d(insumo.nombre)}</span>
                      <span className="shrink-0 tabular text-xs text-destructive">
                        {insumo.stock} / {insumo.stockMinimo} {d(insumo.unidad)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {data.permisos.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-medium">{t("dash.permisosProximos")}</p>
                <ul className="space-y-2">
                  {data.permisos.map((permiso) => (
                    <li
                      key={permiso.id}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <span className="truncate">{d(permiso.nombre)}</span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="text-xs text-muted-foreground">{permiso.vencimiento}</span>
                        <BadgeEstado estado={permiso.estado} />
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function TarjetaIndicador({
  icono: Icono,
  etiqueta,
  valor,
  pie,
  progreso,
}: {
  icono: typeof Coffee;
  etiqueta: string;
  valor: string;
  pie?: string;
  progreso?: number;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm text-muted-foreground">{etiqueta}</p>
          <Icono className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </div>
        <p className="mt-2 font-display text-2xl font-semibold tabular">{valor}</p>
        {pie && <p className="mt-1 text-xs text-muted-foreground">{pie}</p>}
        {progreso !== undefined && (
          <Progress value={progreso} className="mt-3" variant="warning" />
        )}
      </CardContent>
    </Card>
  );
}
