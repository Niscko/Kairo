import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

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
import { SelectCampo } from "@/components/ui/select-campo";
import { useSesion } from "@/features/auth/Sesion";
import { PaginaEncabezado } from "@/components/ui/pagina-encabezado";
import { TablaDatos } from "@/components/ui/tabla-datos";
import { api } from "@/lib/api";
import type { CategoriaProducto, Producto } from "@/lib/tipos";
import { useDato } from "@/i18n/datos";

/** Formatea un monto sin decimales. */
function monto(valor: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(valor);
}

const CATEGORIAS: CategoriaProducto[] = ["bebida", "alimento", "servicio"];

export function Catalogo() {
  const { t } = useTranslation();
  const d = useDato();
  const { usuario } = useSesion();
  const queryClient = useQueryClient();
  const [editando, setEditando] = useState<Producto | null>(null);
  const [creando, setCreando] = useState(false);
  const esAdmin = usuario?.rol === "admin";

  const { data, isLoading } = useQuery({
    queryKey: ["productos"],
    queryFn: () => api.get<{ productos: Producto[] }>("/api/productos?pageSize=100"),
  });

  const columnas = useMemo<ColumnDef<Producto, unknown>[]>(
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
        accessorKey: "categoria",
        header: t("catalogo.categoria"),
        cell: ({ row }) => t(`producto.categoria.${row.original.categoria}`),
      },
      {
        accessorKey: "precio",
        header: t("common.precio"),
        cell: ({ row }) => <span className="tabular">{monto(row.original.precio)}</span>,
      },
      {
        accessorKey: "receta",
        header: t("catalogo.receta"),
        cell: ({ row }) =>
          row.original.receta.length === 0 ? (
            "—"
          ) : (
            <span className="text-xs text-muted-foreground">
              {row.original.receta
                .map((item) => `${d(item.insumo)} ${item.cantidad}${item.unidad}`)
                .join(" · ")}
            </span>
          ),
      },
      ...(esAdmin
        ? [
            {
              id: "acciones",
              header: t("common.acciones"),
              cell: ({ row }: { row: { original: Producto } }) => (
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
        titulo={t("nav.cafeteria")}
        descripcion={t("catalogo.descripcion")}
        acciones={
          esAdmin ? (
            <Button onClick={() => setCreando(true)}>
              <Plus aria-hidden />
              {t("catalogo.nuevo")}
            </Button>
          ) : undefined
        }
      />

      <Card>
        <CardContent className="pt-6">
          <TablaDatos
            columnas={columnas}
            datos={data?.productos ?? []}
            claveFila={(producto) => producto.id}
            cargando={isLoading}
          />
        </CardContent>
      </Card>

      <DialogoProducto
        abierto={creando || editando !== null}
        producto={editando}
        onCerrar={() => {
          setCreando(false);
          setEditando(null);
        }}
        onGuardado={() => {
          setCreando(false);
          setEditando(null);
          void queryClient.invalidateQueries({ queryKey: ["productos"] });
          toast.success(t("common.actualizado"));
        }}
      />
    </div>
  );
}

function DialogoProducto({
  abierto,
  producto,
  onCerrar,
  onGuardado,
}: {
  abierto: boolean;
  producto: Producto | null;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);

  const guardar = useMutation({
    mutationFn: async (formulario: FormData) => {
      const descripcion = String(formulario.get("descripcion") ?? "").trim();
      const cuerpo = {
        nombre: String(formulario.get("nombre")),
        categoria: String(formulario.get("categoria")) as CategoriaProducto,
        precio: Number(formulario.get("precio")),
        esAlcohol: formulario.get("esAlcohol") === "on",
        ...(descripcion ? { descripcion } : {}),
      };
      if (producto) {
        await api.patch(`/api/productos/${producto.id}`, cuerpo);
        return;
      }
      await api.post("/api/productos", cuerpo);
    },
    onSuccess: onGuardado,
    onError: (fallo: Error) => setError(fallo.message),
  });

  return (
    // `key` reinicia el formulario al alternar entre crear y editar.
    <Dialog
      key={producto?.id ?? "nuevo"}
      open={abierto}
      onOpenChange={(valor) => {
        if (!valor) {
          setError(null);
          onCerrar();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{producto ? t("catalogo.editar") : t("catalogo.nuevo")}</DialogTitle>
          <DialogDescription>{t("catalogo.dialogoDescripcion")}</DialogDescription>
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
              defaultValue={producto?.nombre}
              required
              minLength={2}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <SelectCampo
              id="categoria"
              name="categoria"
              etiqueta={t("catalogo.categoria")}
              opciones={CATEGORIAS.map((categoria) => ({
                valor: categoria,
                etiqueta: t(`producto.categoria.${categoria}`),
              }))}
              valorInicial={producto?.categoria ?? "bebida"}
              placeholder={t("common.selecciona")}
            />

            <div className="space-y-2">
              <Label htmlFor="precio">{t("common.precio")}</Label>
              <Input
                id="precio"
                name="precio"
                type="number"
                min={0}
                step={1}
                defaultValue={producto?.precio ?? 0}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="descripcion">{t("common.descripcion")}</Label>
            <Input
              id="descripcion"
              name="descripcion"
              defaultValue={producto?.descripcion ?? ""}
              maxLength={500}
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="esAlcohol"
              defaultChecked={producto?.esAlcohol ?? false}
              className="size-4 accent-primary"
            />
            {t("catalogo.esAlcohol")}
          </label>

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
