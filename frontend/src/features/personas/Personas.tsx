import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
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
import { useSesion } from "@/features/auth/Sesion";
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
  const { usuario } = useSesion();
  const queryClient = useQueryClient();
  const [creando, setCreando] = useState(false);
  const esAdmin = usuario?.rol === "admin";

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
      <PaginaEncabezado
        titulo={t("nav.personas")}
        descripcion={t("personas.descripcion")}
        acciones={
          esAdmin ? (
            <Button onClick={() => setCreando(true)}>
              <Plus aria-hidden />
              {t("personas.nueva")}
            </Button>
          ) : undefined
        }
      />

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

      <DialogoPersona
        abierto={creando}
        onCerrar={() => setCreando(false)}
        onGuardado={() => {
          setCreando(false);
          void queryClient.invalidateQueries({ queryKey: ["empleados"] });
          toast.success(t("common.creado"));
        }}
      />
    </div>
  );
}

function DialogoPersona({
  abierto,
  onCerrar,
  onGuardado,
}: {
  abierto: boolean;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);

  const guardar = useMutation({
    mutationFn: async (formulario: FormData) => {
      const telefono = String(formulario.get("telefono") ?? "").trim();
      await api.post("/api/usuarios", {
        nombre: String(formulario.get("nombre")),
        email: String(formulario.get("email")),
        password: String(formulario.get("password")),
        rol: "empleado",
        cargo: String(formulario.get("cargo")),
        salario: Number(formulario.get("salario")),
        ...(telefono ? { telefono } : {}),
      });
    },
    onSuccess: onGuardado,
    onError: (fallo: Error) => setError(fallo.message),
  });

  return (
    <Dialog
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
          <DialogTitle>{t("personas.nueva")}</DialogTitle>
          <DialogDescription>{t("personas.dialogoDescripcion")}</DialogDescription>
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
            <Input id="nombre" name="nombre" required minLength={3} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="email">{t("common.email")}</Label>
              <Input id="email" name="email" type="email" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="telefono">{t("common.telefono")}</Label>
              <Input id="telefono" name="telefono" type="tel" />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cargo">{t("personas.cargo")}</Label>
              <Input id="cargo" name="cargo" required maxLength={60} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="salario">{t("personas.salario")}</Label>
              <Input id="salario" name="salario" type="number" min={0} step={1} defaultValue={0} required />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">{t("personas.password")}</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
            />
            <p className="text-xs text-muted-foreground">{t("personas.passwordAyuda")}</p>
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
            <Button type="submit" disabled={guardar.isPending}>
              {t("common.guardar")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
