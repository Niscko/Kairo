import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Minus, Plus, ShoppingCart } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
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

import { PaginaEncabezado } from "@/components/ui/pagina-encabezado";
import { SelectCampo } from "@/components/ui/select-campo";

import { api } from "@/lib/api";
import type { CategoriaProducto, MetodoPago, Producto } from "@/lib/tipos";
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
const METODOS: MetodoPago[] = ["efectivo", "tarjeta", "transferencia"];

export function Pedir() {
  const { t } = useTranslation();
  const d = useDato();
  const queryClient = useQueryClient();
  const [carrito, setCarrito] = useState<Map<number, number>>(new Map());
  const [categoria, setCategoria] = useState<CategoriaProducto | "todas">("todas");
  const [confirmando, setConfirmando] = useState(false);

  const productos = useQuery({
    queryKey: ["productos", "pedir"],
    queryFn: () => api.get<{ productos: Producto[] }>("/api/productos?pageSize=100"),
  });

  const disponibilidad = useQuery({
    queryKey: ["disponibilidad"],
    queryFn: () => api.get<{ disponibilidad: Record<string, number> }>("/api/pedidos/disponibilidad"),
  });

  const crearPedido = useMutation({
    mutationFn: async (datos: { metodoPago: MetodoPago; mayorEdad: boolean }) => {
      await api.post("/api/pedidos", {
        metodoPago: datos.metodoPago,
        mayorEdad: datos.mayorEdad,
        items: [...carrito.entries()].map(([productoId, cantidad]) => ({ productoId, cantidad })),
      });
    },
    onSuccess: () => {
      setCarrito(new Map());
      setConfirmando(false);
      void queryClient.invalidateQueries({ queryKey: ["productos"] });
      void queryClient.invalidateQueries({ queryKey: ["disponibilidad"] });
      toast.success(t("pedir.confirmado"));
    },
    onError: (fallo: Error) => toast.error(fallo.message),
  });

  const lista = useMemo(() => {
    const todos = productos.data?.productos ?? [];
    return categoria === "todas" ? todos : todos.filter((p) => p.categoria === categoria);
  }, [productos.data, categoria]);

  const porCategoria = useMemo(() => {
    const grupos = new Map<CategoriaProducto, Producto[]>();
    for (const producto of lista) {
      const grupo = grupos.get(producto.categoria) ?? [];
      grupo.push(producto);
      grupos.set(producto.categoria, grupo);
    }
    return [...grupos.entries()];
  }, [lista]);

  const total = useMemo(
    () =>
      [...carrito.entries()].reduce((suma, [productoId, cantidad]) => {
        const producto = productos.data?.productos.find((p) => p.id === productoId);
        return suma + (producto?.precio ?? 0) * cantidad;
      }, 0),
    [carrito, productos.data],
  );

  const articulos = [...carrito.entries()].map(([productoId, cantidad]) => ({
    producto: productos.data?.productos.find((p) => p.id === productoId),
    cantidad,
  }));

  const incluyeAlcohol = articulos.some((item) => item.producto?.esAlcohol);
  const unidades = [...carrito.values()].reduce((suma, cantidad) => suma + cantidad, 0);

  function agregar(producto: Producto) {
    setCarrito((actual) => {
      const siguiente = new Map(actual);
      const cantidad = (siguiente.get(producto.id) ?? 0) + 1;
      siguiente.set(producto.id, cantidad);
      return siguiente;
    });
  }

  function restar(productoId: number) {
    setCarrito((actual) => {
      const siguiente = new Map(actual);
      const cantidad = (siguiente.get(productoId) ?? 0) - 1;
      if (cantidad <= 0) siguiente.delete(productoId);
      else siguiente.set(productoId, cantidad);
      return siguiente;
    });
  }

  return (
    <div className="space-y-6">
      <PaginaEncabezado
        titulo={t("nav.order")}
        descripcion={t("pedir.descripcion")}
        acciones={
          <Button
            onClick={() => setConfirmando(true)}
            disabled={carrito.size === 0 || crearPedido.isPending}
          >
            <ShoppingCart aria-hidden />
            {t("pedir.verPedido")}
            {unidades > 0 && (
              <Badge variant="secondary" className="ml-1">
                {unidades}
              </Badge>
            )}
          </Button>
        }
      />

      {/* Filtro por categoría */}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={categoria === "todas" ? "default" : "outline"}
          onClick={() => setCategoria("todas")}
        >
          {t("common.todos")}
        </Button>
        {CATEGORIAS.map((valor) => (
          <Button
            key={valor}
            size="sm"
            variant={categoria === valor ? "default" : "outline"}
            onClick={() => setCategoria(valor)}
          >
            {t(`producto.categoria.${valor}`)}
          </Button>
        ))}
      </div>

      {productos.isLoading && <div className="h-64 animate-pulse rounded-lg bg-muted" />}

      {porCategoria.map(([nombreCategoria, grupo]) => (
        <section key={nombreCategoria}>
          <h2 className="mb-3 font-display text-title-lg font-semibold">
            {t(`producto.categoria.${nombreCategoria}`)}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {grupo.map((producto) => {
              const limite = disponibilidad.data?.disponibilidad[String(producto.id)];
              const enCarrito = carrito.get(producto.id) ?? 0;
              const agotado = limite !== undefined && limite <= 0;
              return (
                <Card key={producto.id} className={cnAgotado(agotado)}>
                  <CardContent className="flex h-full flex-col gap-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{d(producto.nombre)}</p>
                        {producto.descripcion && (
                          <p className="text-xs text-muted-foreground">{d(producto.descripcion)}</p>
                        )}
                      </div>
                      {producto.esAlcohol && (
                        <Badge variant="warning" className="shrink-0">
                          +18
                        </Badge>
                      )}
                    </div>

                    <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                      <span className="font-display text-lg font-semibold tabular">
                        {monto(producto.precio)}
                      </span>

                      {enCarrito > 0 ? (
                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="icon"
                            className="size-8"
                            onClick={() => restar(producto.id)}
                            aria-label={t("common.restar")}
                          >
                            <Minus aria-hidden />
                          </Button>
                          <span className="w-7 text-center tabular text-sm">{enCarrito}</span>
                          <Button
                            variant="outline"
                            size="icon"
                            className="size-8"
                            onClick={() => agregar(producto)}
                            disabled={agotado || (limite !== undefined && enCarrito >= limite)}
                            aria-label={t("common.agregar")}
                          >
                            <Plus aria-hidden />
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => agregar(producto)}
                          disabled={agotado}
                        >
                          <Plus aria-hidden />
                          {t("common.agregar")}
                        </Button>
                      )}
                    </div>

                    {agotado && (
                      <p className="text-xs text-destructive">{t("pedir.agotado")}</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      ))}

      {/* Confirmación del pedido */}
      <Dialog open={confirmando} onOpenChange={setConfirmando}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("pedir.confirmar")}</DialogTitle>
            <DialogDescription>{t("pedir.confirmarDescripcion")}</DialogDescription>
          </DialogHeader>

          <ul className="space-y-2">
            {articulos.map((item) =>
              item.producto ? (
                <li key={item.producto.id} className="flex justify-between text-sm">
                  <span className="truncate">
                    {item.cantidad}× {d(item.producto.nombre)}
                  </span>
                  <span className="shrink-0 tabular">
                    {monto(item.producto.precio * item.cantidad)}
                  </span>
                </li>
              ) : null,
            )}
          </ul>

          <div className="flex items-center justify-between border-t border-border pt-3 text-sm font-medium">
            <span>{t("common.total")}</span>
            <span className="tabular">{monto(total)}</span>
          </div>

          <DialogoConfirmacion
            metodoPago={crearPedido.mutate}
            incluyeAlcohol={incluyeAlcohol}
            cargando={crearPedido.isPending}
            onCancelar={() => setConfirmando(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Opción de pago y confirmación de edad, dentro del diálogo. */
function DialogoConfirmacion({
  metodoPago,
  incluyeAlcohol,
  cargando,
  onCancelar,
}: {
  metodoPago: (datos: { metodoPago: MetodoPago; mayorEdad: boolean }) => void;
  incluyeAlcohol: boolean;
  cargando: boolean;
  onCancelar: () => void;
}) {
  const { t } = useTranslation();
  const [metodo, setMetodo] = useState<MetodoPago>("efectivo");
  const [mayorEdad, setMayorEdad] = useState(false);

  return (
    <>
      <SelectCampo
        id="metodoPago"
        name="metodoPago"
        etiqueta={t("ventas.metodo")}
        opciones={METODOS.map((valor) => ({
          valor,
          etiqueta: t(`metodo.${valor}`),
        }))}
        valorControlado={metodo}
        onValorCambia={(valor) => setMetodo(valor as MetodoPago)}
      />

      {incluyeAlcohol && (
        <label className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
          <input
            type="checkbox"
            checked={mayorEdad}
            onChange={(evento) => setMayorEdad(evento.target.checked)}
            className="mt-0.5 size-4"
          />
          <span>{t("pedido.confirmarEdad")}</span>
        </label>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={onCancelar}>
          {t("common.cancelar")}
        </Button>
        <Button
          onClick={() => metodoPago({ metodoPago: metodo, mayorEdad })}
          disabled={cargando || (incluyeAlcohol && !mayorEdad)}
        >
          {cargando ? t("common.cargando") : t("pedir.confirmar")}
        </Button>
      </DialogFooter>
    </>
  );
}

/** Atenúa la tarjeta de un producto agotado. */
function cnAgotado(agotado: boolean): string {
  return agotado ? "opacity-60" : "";
}
