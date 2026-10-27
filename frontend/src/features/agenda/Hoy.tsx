import { useQuery } from "@tanstack/react-query";
import { CalendarClock, type Coffee, Sparkles, Users } from "lucide-react";
import { useTranslation } from "react-i18next";

import { BadgeEstado } from "@/components/ui/badge-estado";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PaginaEncabezado } from "@/components/ui/pagina-encabezado";
import { Progress } from "@/components/ui/progress";
import { api } from "@/lib/api";

interface Agenda {
  dia: string;
  reservas: Array<{
    id: number;
    espacio: string;
    espacioTipo: string;
    cliente: string | null;
    inicio: string;
    fin: string;
    proposito: string;
    estado: string;
    monto: number;
  }>;
  turnos: Array<{
    id: number;
    nombre: string;
    cargo: string;
    horaInicio: string;
    horaFin: string;
    area: string;
  }>;
  experiencias: Array<{
    id: number;
    nombre: string;
    espacio: string;
    inicio: string;
    fin: string;
    estado: string;
    participantes: number;
    capacidad: number;
  }>;
  ocupacion: Array<{
    id: number;
    nombre: string;
    tipo: string;
    zona: string;
    presencia: "ocupado" | "libre";
    hasta: string | null;
  }>;
  horasPorEspacio: Array<{ id: number; nombre: string; horas: number }>;
}

/** Formatea un monto sin decimales. */
function monto(valor: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(valor);
}

export function Hoy() {
  const { t } = useTranslation();

  const { data, isLoading } = useQuery({
    queryKey: ["agenda"],
    queryFn: () => api.get<Agenda>("/api/agenda"),
    refetchInterval: 60_000,
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <div className="h-9 w-40 animate-pulse rounded-md bg-muted" />
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="h-64 animate-pulse rounded-lg bg-muted" />
          <div className="h-64 animate-pulse rounded-lg bg-muted" />
        </div>
      </div>
    );
  }

  const ocupados = data.ocupacion.filter((e) => e.presencia === "ocupado").length;
  const totalEspacios = data.ocupacion.length;

  return (
    <div className="space-y-6">
      <PaginaEncabezado
        titulo={t("nav.today")}
        descripcion={t("agenda.descripcion", { dia: data.dia })}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <TarjetaDia
          icono={CalendarClock}
          etiqueta={t("agenda.reservas")}
          valor={String(data.reservas.length)}
        />
        <TarjetaDia
          icono={Sparkles}
          etiqueta={t("agenda.experiencias")}
          valor={String(data.experiencias.length)}
        />
        <TarjetaDia
          icono={Users}
          etiqueta={t("agenda.ocupacion")}
          valor={`${ocupados}/${totalEspacios}`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Reservas del día */}
        <Card>
          <CardHeader>
            <CardTitle>{t("agenda.reservas")}</CardTitle>
            <CardDescription>{t("agenda.reservasDescripcion")}</CardDescription>
          </CardHeader>
          <CardContent>
            {data.reservas.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("common.sinResultados")}</p>
            ) : (
              <ul className="space-y-3">
                {data.reservas.map((reserva) => (
                  <li key={reserva.id} className="flex items-start gap-3 text-sm">
                    <span className="w-24 shrink-0 tabular text-muted-foreground">
                      {reserva.inicio.slice(11, 16)}–{reserva.fin.slice(11, 16)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{reserva.espacio}</p>
                      <p className="text-xs text-muted-foreground">
                        {reserva.cliente ?? t(`proposito.${reserva.proposito}`)}
                        {" · "}
                        {reserva.monto === 0
                          ? t("reservas.incluida")
                          : monto(reserva.monto)}
                      </p>
                    </div>
                    <BadgeEstado estado={reserva.estado} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Ocupación en vivo */}
        <Card>
          <CardHeader>
            <CardTitle>{t("agenda.espacios")}</CardTitle>
            <CardDescription>{t("agenda.presenciaAhora")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {data.ocupacion.map((espacio) => {
                const horas = data.horasPorEspacio.find((h) => h.id === espacio.id)?.horas ?? 0;
                // Un día de atención son 16 horas.
                const porcentaje = Math.min(100, (horas / 16) * 100);
                return (
                  <li key={espacio.id} className="flex items-center gap-3 text-sm">
                    <span className="w-28 shrink-0 truncate">{espacio.nombre}</span>
                    <Progress value={porcentaje} className="flex-1" />
                    <span className="w-16 shrink-0 text-right tabular text-xs text-muted-foreground">
                      {espacio.presencia === "ocupado" && espacio.hasta
                        ? `→ ${espacio.hasta.slice(11, 16)}`
                        : `${horas}h`}
                    </span>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Experiencias */}
        {data.experiencias.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="size-4 text-primary" aria-hidden />
                {t("agenda.experiencias")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {data.experiencias.map((experiencia) => (
                  <li key={experiencia.id} className="flex items-start gap-3 text-sm">
                    <span className="w-24 shrink-0 tabular text-muted-foreground">
                      {experiencia.inicio.slice(11, 16)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{experiencia.nombre}</p>
                      <p className="text-xs text-muted-foreground">
                        {experiencia.espacio} ·{" "}
                        {t("experiencias.capacidad")} {experiencia.participantes}/
                        {experiencia.capacidad}
                      </p>
                    </div>
                    <BadgeEstado estado={experiencia.estado} />
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Turnos */}
        {data.turnos.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="size-4 text-primary" aria-hidden />
                {t("agenda.turnos")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {data.turnos.map((turno) => (
                  <li key={turno.id} className="flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{turno.nombre}</p>
                      <p className="text-xs text-muted-foreground">{turno.area}</p>
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
    </div>
  );
}

function TarjetaDia({
  icono: Icono,
  etiqueta,
  valor,
}: {
  icono: typeof Coffee;
  etiqueta: string;
  valor: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <p className="text-sm text-muted-foreground">{etiqueta}</p>
          <p className="mt-1 font-display text-2xl font-semibold tabular">{valor}</p>
        </div>
        <Icono className="size-5 text-muted-foreground" aria-hidden />
      </CardContent>
    </Card>
  );
}
