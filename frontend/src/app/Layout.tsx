import { LogOut, Menu, PanelLeft, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, Outlet, useLocation } from "react-router-dom";

import { enlacesVisibles } from "@/app/navegacion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useSesion } from "@/features/auth/Sesion";
import { SelectorIdioma } from "@/features/auth/SelectorIdioma";
import { cn } from "@/lib/utils";

/**
 * Estructura de la aplicación: barra lateral con la navegación, cabecera con
 * el usuario y el idioma, y el contenido de la ruta activa.
 */
export function Layout() {
  const { t } = useTranslation();
  const { usuario, salir } = useSesion();
  const [colapsada, setColapsada] = useState(false);
  const [abiertaMovil, setAbiertaMovil] = useState(false);
  const ubicacion = useLocation();

  // Al cambiar de ruta se cierra el menú lateral en móvil.
  useEffect(() => {
    setAbiertaMovil(false);
  }, [ubicacion.pathname]);

  if (!usuario) return null;

  const secciones = enlacesVisibles(usuario.rol);

  return (
    <div className="flex min-h-screen bg-background">
      {/* Capa oscura del menú en móvil */}
      {abiertaMovil && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setAbiertaMovil(false)}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex flex-col border-r border-border bg-sidebar transition-all duration-200 lg:sticky lg:top-0 lg:h-screen lg:shrink-0",
          colapsada ? "w-[68px]" : "w-64",
          abiertaMovil ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        <div className="flex h-16 items-center gap-2 border-b border-border px-4">
          <span className="font-display text-xl font-semibold text-primary">Kairo</span>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto lg:hidden"
            onClick={() => setAbiertaMovil(false)}
            aria-label={t("common.cerrar")}
          >
            <X aria-hidden />
          </Button>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4" aria-label={t("nav.principal")}>
          {secciones.map(({ grupo, enlaces }) => (
            <div key={grupo.clave}>
              {!colapsada && (
                <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t(grupo.clave)}
                </p>
              )}
              <ul className="space-y-0.5">
                {enlaces.map((enlace) => {
                  const Icono = enlace.icono;
                  return (
                    <li key={enlace.ruta}>
                      <NavLink
                        to={enlace.ruta}
                        end={enlace.ruta === "/"}
                        title={colapsada ? t(enlace.clave) : undefined}
                        className={({ isActive }) =>
                          cn(
                            "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                            isActive
                              ? "bg-primary/10 text-primary"
                              : "text-sidebar-foreground/80 hover:bg-accent hover:text-accent-foreground",
                            colapsada && "justify-center px-0",
                          )
                        }
                      >
                        <Icono className="size-4 shrink-0" aria-hidden />
                        {!colapsada && <span className="truncate">{t(enlace.clave)}</span>}
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-border p-3">
          {!colapsada && (
            <>
              <div className="mb-2 px-3">
                <p className="truncate text-sm font-medium">{usuario.nombre}</p>
                <Badge variant="muted" className="mt-1">
                  {t(`role.${usuario.rol}`)}
                </Badge>
              </div>
              <Separator className="mb-2" />
            </>
          )}
          <Button
            variant="ghost"
            size={colapsada ? "icon" : "sm"}
            className={cn("w-full justify-start gap-3", colapsada && "justify-center")}
            onClick={() => void salir()}
            title={t("common.salir")}
          >
            <LogOut className="size-4" aria-hidden />
            {!colapsada && t("common.salir")}
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setAbiertaMovil(true)}
            aria-label={t("common.menu")}
          >
            <Menu aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="hidden lg:inline-flex"
            onClick={() => setColapsada((valor) => !valor)}
            aria-label={t("common.colapsarMenu")}
          >
            <PanelLeft aria-hidden />
          </Button>

          <div className="ml-auto flex items-center gap-2">
            <SelectorIdioma />
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
