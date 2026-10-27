import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { CalendarPlus, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { BadgeEstado } from "@/components/ui/badge-estado";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { PaginaEncabezado } from "@/components/ui/pagina-encabezado";
import { SelectCampo } from "@/components/ui/select-campo";
import { TablaDatos } from "@/components/ui/tabla-datos";
import { useSesion } from "@/features/auth/Sesion";
import { api } from "@/lib/api";
import type { Espacio, PropositoReserva, Reserva } from "@/lib/tipos";

/** Formatea un monto sin decimales. */
function monto(valor: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(valor);
}

const PROPOSITOS: PropositoReserva[] = ["trabajo", "estudio", "reunion", "consumo"];

/** Fecha de hoy en "YYYY-MM-DD". */
function hoy(): string {
  const fecha = new Date();
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}`;
}

/**
 * Convierte el valor de un input datetime-local ("AAAA-MM-DDTHH:MM") al
 * formato que espera la API ("AAAA-MM-DD HH:MM").
 */
function aFormatoApi(valor: string): string {
  return valor.replace("T", " ");
}

export function Reservas() {
  const { t } = useTranslation();
  const { usuario } = useSesion();
  const queryClient = useQueryClient();
  const [creando, setCreando] = useState(false);
  const [dia, setDia] = useState(hoy());

  const { data, isLoading } = useQuery({
    queryKey: ["reservas", dia],
    queryFn: () => api.get<{ dia: string; reservas: Reserva[] }>(`/api/reservas?dia=${dia}`),
  });

  const cancelar = useMutation({
    mutationFn: (id: number) => api.patch(`/api/reservas/${id}`, { estado: "cancelada" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["reservas"] });
      toast.success(t("reservas.cancelada"));
    },
    onError: (fallo: Error) => toast.error(fallo.message),
  });

  const columnas = useMemo<ColumnDef<Reserva, unknown>[]>(
    () => [
      {
        accessorKey: "inicio",
        header: t("reservas.horario"),
        cell: ({ row }) => (
          <span className="tabular text-xs">
            {row.original.inicio.slice(11, 16)}–{row.original.fin.slice(11, 16)}
          </span>
        ),
      },
      {
        accessorKey: "espacio",
        header: t("reservas.espacio"),
        cell: ({ row }) => <span className="font-medium">{row.original.espacio}</span>,
      },
      { accessorKey: "cliente", header: t("reservas.cliente") },
      {
        accessorKey: "proposito",
        header: t("reservas.proposito"),
        cell: ({ row }) => t(`proposito.${row.original.proposito}`),
      },
      {
        accessorKey: "monto",
        header: t("common.total"),
        cell: ({ row }) => (
          <span className="tabular">{row.original.monto === 0 ? t("reservas.incluida") : monto(row.original.monto)}</span>
        ),
      },
      {
        accessorKey: "estado",
        header: t("common.estado"),
        cell: ({ row }) => <BadgeEstado estado={row.original.estado} />,
      },
      {
        id: "acciones",
        header: t("common.acciones"),
        cell: ({ row }: { row: { original: Reserva } }) =>
          row.original.estado === "cancelada" || row.original.estado === "completada" ? null : (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => cancelar.mutate(row.original.id)}
              disabled={cancelar.isPending}
              aria-label={t("reservas.cancelar")}
            >
              <XCircle aria-hidden />
            </Button>
          ),
      },
    ],
    [t, cancelar],
  );

  return (
    <div>
      <PaginaEncabezado
        titulo={t("nav.book")}
        descripcion={t("reservas.descripcion")}
        acciones={
          <Button onClick={() => setCreando(true)}>
            <CalendarPlus aria-hidden />
            {t("reservas.crear")}
          </Button>
        }
      />

      <div className="mb-4 flex items-center gap-2">
        <Label htmlFor="dia" className="text-sm">
          {t("common.fecha")}
        </Label>
        <Input
          id="dia"
          type="date"
          value={dia}
          onChange={(evento) => setDia(evento.target.value)}
          className="w-44"
        />
      </div>

      <Card>
        <CardContent className="pt-6">
          <TablaDatos
            columnas={columnas}
            datos={data?.reservas ?? []}
            claveFila={(reserva) => reserva.id}
            cargando={isLoading}
            mensajeVacio={t("reservas.sinReservas")}
          />
        </CardContent>
      </Card>

      <DialogoReserva
        abierto={creando}
        onCerrar={() => setCreando(false)}
        onGuardado={() => {
          setCreando(false);
          void queryClient.invalidateQueries({ queryKey: ["reservas"] });
          toast.success(t("reservas.creada"));
        }}
        esCliente={usuario?.rol === "cliente"}
      />
    </div>
  );
}

function DialogoReserva({
  abierto,
  onCerrar,
  onGuardado,
  esCliente,
}: {
  abierto: boolean;
  onCerrar: () => void;
  onGuardado: () => void;
  esCliente: boolean;
}) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);

  const espacios = useQuery({
    queryKey: ["espacios", "reserva"],
    queryFn: () => api.get<{ datos: Espacio[] }>("/api/espacios?pageSize=100&estado=disponible"),
  });

  const clientes = useQuery({
    queryKey: ["clientes", "reserva"],
    queryFn: () => api.get<{ clientes: Array<{ id: number; nombre: string }> }>("/api/clientes"),
    enabled: !esCliente,
  });

  const crear = useMutation({
    mutationFn: async (formulario: FormData) => {
      const cuerpo = {
        espacioId: Number(formulario.get("espacioId")),
        // El input datetime-local usa "T" como separador; la API espera
        // "AAAA-MM-DD HH:MM".
        inicio: aFormatoApi(String(formulario.get("inicio"))),
        fin: aFormatoApi(String(formulario.get("fin"))),
        proposito: String(formulario.get("proposito")) as PropositoReserva,
        ...(formulario.get("clienteId")
          ? { clienteId: Number(formulario.get("clienteId")) }
          : {}),
        notas: String(formulario.get("notas") ?? "").trim() || undefined,
      };
      await api.post("/api/reservas", cuerpo);
    },
    onSuccess: onGuardado,
    onError: (fallo: Error) => setError(fallo.message),
  });

  const fecha = hoy();

  return (
    <Dialog open={abierto} onOpenChange={(valor) => !valor && onCerrar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("reservas.crear")}</DialogTitle>
          <DialogDescription>{t("reservas.dialogoDescripcion")}</DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(evento) => {
            evento.preventDefault();
            setError(null);
            crear.mutate(new FormData(evento.currentTarget));
          }}
          className="space-y-4"
        >
          <SelectCampo
            id="espacioId"
            name="espacioId"
            etiqueta={t("reservas.espacio")}
            opciones={(espacios.data?.datos ?? []).map((espacio) => ({
              valor: String(espacio.id),
              etiqueta: `${espacio.nombre} · ${espacio.zona}`,
            }))}
            placeholder={t("common.selecciona")}
            requerido
          />

          {!esCliente && (
            <SelectCampo
              id="clienteId"
              name="clienteId"
              etiqueta={t("reservas.cliente")}
              opciones={(clientes.data?.clientes ?? []).map((cliente) => ({
                valor: String(cliente.id),
                etiqueta: cliente.nombre,
              }))}
              placeholder={t("common.selecciona")}
              requerido
            />
          )}

          <SelectCampo
            id="proposito"
            name="proposito"
            etiqueta={t("reservas.proposito")}
            opciones={PROPOSITOS.map((proposito) => ({
              valor: proposito,
              etiqueta: t(`proposito.${proposito}`),
            }))}
            valorInicial="trabajo"
            requerido
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="inicio">{t("reservas.inicio")}</Label>
              <Input
                id="inicio"
                name="inicio"
                type="datetime-local"
                defaultValue={`${fecha}T08:00`}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fin">{t("reservas.fin")}</Label>
              <Input
                id="fin"
                name="fin"
                type="datetime-local"
                defaultValue={`${fecha}T10:00`}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notas">{t("reservas.notas")}</Label>
            <Input id="notas" name="notas" maxLength={240} />
          </div>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCerrar}>
              {t("common.cancelar")}
            </Button>
            <Button type="submit" disabled={crear.isPending}>
              {t("common.guardar")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
