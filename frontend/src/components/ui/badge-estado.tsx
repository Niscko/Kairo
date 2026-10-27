import { useTranslation } from "react-i18next";

import { Badge, type BadgeProps } from "@/components/ui/badge";

/**
 * Badge de estado. Traduce el valor crudo de la API con la clave del
 * diccionario y le asigna un color según su semántica.
 */
export function BadgeEstado({
  estado,
  traducir = true,
}: {
  estado: string;
  traducir?: boolean;
}) {
  const { t } = useTranslation();

  const variantes: Record<string, BadgeProps["variant"]> = {
    // Reservas
    confirmada: "default",
    en_curso: "warning",
    completada: "success",
    cancelada: "muted",
    // Espacios
    disponible: "success",
    mantenimiento: "destructive",
    ocupado: "warning",
    libre: "muted",
    // Equipos
    operativo: "success",
    prestado: "default",
    // Experiencias
    programada: "default",
    finalizada: "success",
    // Costos
    pendiente: "warning",
    pagado: "success",
    // Permisos
    vigente: "success",
    vencido: "destructive",
    // Usuarios
    activo: "success",
    inactivo: "muted",
    // Inventario
    entrada: "success",
    salida: "default",
    merma: "destructive",
    // Membresías
    ninguna: "muted",
    dia: "secondary",
    mensual: "default",
  };

  const clave = `status.${estado}`;
  const etiqueta = traducir && t(clave) !== clave ? t(clave) : estado;

  return <Badge variant={variantes[estado] ?? "secondary"}>{etiqueta}</Badge>;
}
