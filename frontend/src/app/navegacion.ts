import {
  Armchair,
  BarChart3,
  CalendarDays,
  ClipboardList,
  Coffee,
  LayoutDashboard,
  Package,
  Receipt,
  Settings,
  Sparkles,
  Users,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { Rol } from "@/lib/tipos";

export interface EnlaceNav {
  /** Ruta del router. */
  ruta: string;
  /** Clave de traducción en el diccionario. */
  clave: string;
  icono: LucideIcon;
  /** Roles con acceso. Si se omite, es visible para todos. */
  roles?: Rol[];
}

export interface GrupoNav {
  clave: string;
  enlaces: EnlaceNav[];
}

/**
 * Navegación de la aplicación.
 *
 * Los roles se declaran aquí, en un solo lugar: la barra lateral y las rutas
 * comparten la misma fuente, así un usuario nunca ve un enlace que el backend
 * le va a rechazar.
 */
export const NAVEGACION: GrupoNav[] = [
  {
    clave: "nav.principal",
    enlaces: [
      {
        ruta: "/",
        clave: "nav.dashboard",
        icono: LayoutDashboard,
      },
      {
        ruta: "/hoy",
        clave: "nav.today",
        icono: CalendarDays,
      },
      {
        ruta: "/espacios",
        clave: "nav.espacios",
        icono: Armchair,
      },
      {
        ruta: "/reservas",
        clave: "nav.book",
        icono: ClipboardList,
      },
    ],
  },
  {
    clave: "nav.cafeteria",
    enlaces: [
      {
        ruta: "/pedir",
        clave: "nav.order",
        icono: Coffee,
        roles: ["admin", "empleado", "cliente"],
      },
      {
        ruta: "/catalogo",
        clave: "nav.cafeteria",
        icono: UtensilsCrossed,
        roles: ["admin", "empleado"],
      },
      {
        ruta: "/inventario",
        clave: "nav.inventario",
        icono: Package,
        roles: ["admin", "empleado"],
      },
      {
        ruta: "/ventas",
        clave: "nav.ventas",
        icono: Receipt,
        roles: ["admin", "empleado"],
      },
    ],
  },
  {
    clave: "nav.experiencias",
    enlaces: [
      {
        ruta: "/experiencias",
        clave: "nav.experiencias",
        icono: Sparkles,
      },
    ],
  },
  {
    clave: "nav.gestion",
    enlaces: [
      {
        ruta: "/personas",
        clave: "nav.personas",
        icono: Users,
        roles: ["admin", "empleado"],
      },
      {
        ruta: "/clientes",
        clave: "nav.clientes",
        icono: Users,
        roles: ["admin", "empleado"],
      },
      {
        ruta: "/turnos",
        clave: "nav.turnos",
        icono: CalendarDays,
        roles: ["admin", "empleado"],
      },
      {
        ruta: "/equipos",
        clave: "nav.equipos",
        icono: Settings,
        roles: ["admin", "empleado"],
      },
      {
        ruta: "/operacion",
        clave: "nav.operacion",
        icono: Wallet,
        roles: ["admin"],
      },
      {
        ruta: "/reportes",
        clave: "nav.reportes",
        icono: BarChart3,
        roles: ["admin"],
      },
    ],
  },
];

/** Enlaces visibles para un rol concreto. */
export function enlacesVisibles(rol: Rol): Array<{ grupo: GrupoNav; enlaces: EnlaceNav[] }> {
  return NAVEGACION.map((grupo) => ({
    grupo,
    enlaces: grupo.enlaces.filter((enlace) => !enlace.roles || enlace.roles.includes(rol)),
  })).filter((seccion) => seccion.enlaces.length > 0);
}
