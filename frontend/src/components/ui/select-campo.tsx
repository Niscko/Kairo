import * as React from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface OpcionCampo {
  valor: string;
  etiqueta: string;
}

/**
 * Campo de formulario con un Select de Radix.
 *
 * Radix no genera un `<select>` nativo, así que su valor no viaja en el
 * `FormData`. Este componente envuelve el control en un `<form>` con un
 * `<input type="hidden">` que sí lo hace: los formularios siguen siendo HTML
 * nativo, sin estado controlado.
 */
export function SelectCampo({
  name,
  id,
  etiqueta,
  opciones,
  valorInicial,
  valorControlado,
  onValorCambia,
  placeholder,
  requerido = false,
  deshabilitado = false,
  className,
}: {
  name: string;
  id: string;
  etiqueta?: string;
  opciones: OpcionCampo[];
  valorInicial?: string;
  /**
   * Valor controlado. Cuando se pasa, el componente notifica los cambios por
   * `onValorCambia` en vez de mantener su propio estado.
   */
  valorControlado?: string;
  onValorCambia?: (valor: string) => void;
  placeholder?: string;
  requerido?: boolean;
  deshabilitado?: boolean;
  className?: string;
}) {
  const [valorInterno, setValorInterno] = React.useState(valorInicial ?? "");
  const controlado = valorControlado !== undefined;
  const valor = controlado ? valorControlado : valorInterno;

  const cambiar = (nuevo: string) => {
    if (!controlado) setValorInterno(nuevo);
    onValorCambia?.(nuevo);
  };

  return (
    <div className={cn("space-y-2", className)}>
      {etiqueta && <Label htmlFor={id}>{etiqueta}</Label>}
      <input type="hidden" name={name} value={valor} required={requerido} />
      <Select
        value={valor}
        onValueChange={cambiar}
        disabled={deshabilitado}
        // Radix exige un nombre único por control dentro de un <form>.
        name={`${name}-radix`}
      >
        <SelectTrigger id={id}>
          <SelectValue placeholder={placeholder ?? "—"} />
        </SelectTrigger>
        <SelectContent>
          {opciones.map((opcion) => (
            <SelectItem key={opcion.valor} value={opcion.valor}>
              {opcion.etiqueta}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
