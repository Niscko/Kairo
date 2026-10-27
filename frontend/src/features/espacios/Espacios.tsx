import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Plus } from "lucide-react";
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
import type { Espacio, TipoEspacio } from "@/lib/tipos";
import { useDato } from "@/i18n/datos";

/** Formatea un monto sin decimales. */
function monto(valor: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(valor);
}

const TIPOS: TipoEspacio[] = ["puesto", "sala", "mesa", "evento"];

export function Espacios() {
  const { t } = useTranslation();
  const d = useDato();
  const { usuario } = useSesion();
  const queryClient = useQueryClient();
  const [editando, setEditando] = useState<Espacio | null>(null);
  const [creando, setCreando] = useState(false);
  // Id del espacio recién creado: se fija arriba de la tabla para que el
  // usuario vea de inmediato el resultado de su acción.
  const [destacado, setDestacado] = useState<number | null>(null);

  const esAdmin = usuario?.rol === "admin";

  const { data, isLoading } = useQuery({
    queryKey: ["espacios"],
    queryFn: () => api.get<{ datos: Espacio[]; total: number }>("/api/espacios?pageSize=100"),
  });

  const columnas = useMemo<ColumnDef<Espacio, unknown>[]>(
    () => [
      {
        accessorKey: "nombre",
        header: t("common.nombre"),
        cell: ({ row }) => <span className="font-medium">{d(row.original.nombre)}</span>,
      },
      {
        accessorKey: "tipo",
        header: t("espacios.tipo"),
        cell: ({ row }) => t(`espacio.tipo.${row.original.tipo}`),
      },
      {
        accessorKey: "zona",
        header: t("espacios.zona"),
        cell: ({ row }) => d(row.original.zona),
      },
      {
        accessorKey: "capacidad",
        header: t("espacios.capacidad"),
        cell: ({ row }) => <span className="tabular">{row.original.capacidad}</span>,
      },
      {
        accessorKey: "tarifaHora",
        header: t("espacios.tarifa"),
        cell: ({ row }) => <span className="tabular">{monto(row.original.tarifaHora)}</span>,
      },
      {
        accessorKey: "estado",
        header: t("common.estado"),
        cell: ({ row }) => <BadgeEstado estado={row.original.estado} />,
      },
      ...(esAdmin
        ? [
            {
              id: "acciones",
              header: t("common.acciones"),
              cell: ({ row }: { row: { original: Espacio } }) => (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setEditando(row.original)}
                  aria-label={t("common.editar")}
                >
                  <Pencil aria-hidden />
                </Button>
              ),
            },
          ]
        : []),
    ],
    [t, d, esAdmin],
  );

  return (
    <div>
      <PaginaEncabezado
        titulo={t("nav.espacios")}
        descripcion={t("espacios.descripcion")}
        acciones={
          esAdmin ? (
            <Button onClick={() => setCreando(true)}>
              <Plus aria-hidden />
              {t("espacios.crear")}
            </Button>
          ) : undefined
        }
      />

      <Card>
        <CardContent className="pt-6">
          <TablaDatos
            columnas={columnas}
            datos={data?.datos ?? []}
            claveFila={(espacio) => espacio.id}
            cargando={isLoading}
            mensajeVacio={t("common.sinResultados")}
            destacado={destacado}
          />
        </CardContent>
      </Card>
      <DialogoEspacio
        abierto={creando || editando !== null}
        espacio={editando}
        onCerrar={() => {
          setCreando(false);
          setEditando(null);
        }}
        onGuardado={(idCreado) => {
          setCreando(false);
          setEditando(null);
          setDestacado(idCreado);
          void queryClient.invalidateQueries({ queryKey: ["espacios"] });
          toast.success(t("common.actualizado"));
        }}
      />
    </div>
  );
}

function DialogoEspacio({
  abierto,
  espacio,
  onCerrar,
  onGuardado,
}: {
  abierto: boolean;
  espacio: Espacio | null;
  onCerrar: () => void;
  /** Recibe el id del espacio creado o actualizado. */
  onGuardado: (id: number) => void;
}) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);

  const guardar = useMutation({
    mutationFn: async (formulario: FormData) => {
      const cuerpo = {
        nombre: String(formulario.get("nombre")),
        tipo: String(formulario.get("tipo")) as TipoEspacio,
        capacidad: Number(formulario.get("capacidad")),
        tarifaHora: Number(formulario.get("tarifaHora")),
        zona: String(formulario.get("zona")),
        ...(espacio ? { estado: String(formulario.get("estado")) } : {}),
      };
      if (espacio) {
        await api.patch(`/api/espacios/${espacio.id}`, cuerpo);
        return espacio.id;
      }
      const creado = await api.post<{ id: number }>("/api/espacios", cuerpo);
      return creado.id;
    },
    onSuccess: onGuardado,
    onError: (fallo: Error) => setError(fallo.message),
  });

  return (
    <Dialog open={abierto} onOpenChange={(valor) => !valor && onCerrar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{espacio ? t("espacios.editar") : t("espacios.crear")}</DialogTitle>
          <DialogDescription>{t("espacios.dialogoDescripcion")}</DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(evento) => {
            evento.preventDefault();
            setError(null);
            guardar.mutate(new FormData(evento.currentTarget));
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="nombre">{t("common.nombre")}</Label>
            <Input
              id="nombre"
              name="nombre"
              defaultValue={espacio?.nombre}
              required
              minLength={3}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <SelectCampo
              id="tipo"
              name="tipo"
              etiqueta={t("espacios.tipo")}
              opciones={TIPOS.map((tipo) => ({
                valor: tipo,
                etiqueta: t(`espacio.tipo.${tipo}`),
              }))}
              valorInicial={espacio?.tipo ?? "puesto"}
              placeholder={t("common.selecciona")}
            />

            <div className="space-y-2">
              <Label htmlFor="zona">{t("espacios.zona")}</Label>
              <Input id="zona" name="zona" defaultValue={espacio?.zona} required />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="capacidad">{t("espacios.capacidad")}</Label>
              <Input
                id="capacidad"
                name="capacidad"
                type="number"
                min={1}
                defaultValue={espacio?.capacidad ?? 1}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tarifaHora">{t("espacios.tarifa")}</Label>
              <Input
                id="tarifaHora"
                name="tarifaHora"
                type="number"
                min={0}
                defaultValue={espacio?.tarifaHora ?? 0}
                required
              />
            </div>
          </div>

          {espacio && (
            <SelectCampo
              id="estado"
              name="estado"
              etiqueta={t("common.estado")}
              opciones={[
                { valor: "disponible", etiqueta: t("status.disponible") },
                { valor: "mantenimiento", etiqueta: t("status.mantenimiento") },
              ]}
              valorInicial={espacio.estado}
            />
          )}

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCerrar}>
              {t("common.cancelar")}
            </Button>
            <Button type="submit" disabled={guardar.isPending}>
              {t("common.guardar")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
