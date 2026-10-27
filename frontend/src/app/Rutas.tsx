import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { ReactNode } from "react";

import { Layout } from "@/app/Layout";
import { useSesion } from "@/features/auth/Sesion";
import { Login } from "@/features/auth/Login";
import { Dashboard } from "@/features/dashboard/Dashboard";
import { Espacios } from "@/features/espacios/Espacios";
import { Reservas } from "@/features/reservas/Reservas";
import { Experiencias } from "@/features/experiencias/Experiencias";
import { Personas } from "@/features/personas/Personas";
import { Hoy } from "@/features/agenda/Hoy";
import { Clientes } from "@/features/clientes/Clientes";
import { Turnos } from "@/features/turnos/Turnos";
import { Equipos } from "@/features/equipos/Equipos";
import { Catalogo } from "@/features/catalogo/Catalogo";
import { Inventario } from "@/features/inventario/Inventario";
import { Ventas } from "@/features/ventas/Ventas";
import { Operacion } from "@/features/operacion/Operacion";
import { Pedir } from "@/features/pedir/Pedir";
import { Reportes } from "@/features/reportes/Reportes";
import { Registros } from "@/features/registros/Registros";

/**
 * Protege una ruta exigiendo sesión. Guarda la ruta solicitada para volver a
 * ella tras entrar.
 */
function Privada({ children, roles }: { children: ReactNode; roles?: string[] }) {
  const { usuario, cargando } = useSesion();
  const ubicacion = useLocation();

  if (cargando) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">…</p>
      </div>
    );
  }

  if (!usuario) {
    return <Navigate to="/entrar" replace state={{ desde: ubicacion.pathname }} />;
  }

  if (roles && !roles.includes(usuario.rol)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

/** Redirige al panel si ya hay sesión. */
function SoloVisitantes({ children }: { children: ReactNode }) {
  const { usuario, cargando } = useSesion();

  if (cargando) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">…</p>
      </div>
    );
  }

  if (usuario) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

export function Rutas() {
  return (
    <Routes>
      <Route
        path="/entrar"
        element={
          <SoloVisitantes>
            <Login />
          </SoloVisitantes>
        }
      />

      <Route
        element={
          <Privada>
            <Layout />
          </Privada>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="espacios" element={<Espacios />} />
        <Route path="reservas" element={<Reservas />} />
        <Route path="experiencias" element={<Experiencias />} />
        <Route path="catalogo" element={<Catalogo />} />
        <Route path="inventario" element={<Inventario />} />
        <Route path="ventas" element={<Ventas />} />
        <Route path="personas" element={<Personas />} />
        <Route path="clientes" element={<Clientes />} />
        <Route path="turnos" element={<Turnos />} />
        <Route path="equipos" element={<Equipos />} />
        <Route path="operacion" element={<Operacion />} />
        <Route
          path="reportes"
          element={
            <Privada roles={["admin"]}>
              <Reportes />
            </Privada>
          }
        />
        <Route
          path="registros"
          element={
            <Privada roles={["admin"]}>
              <Registros />
            </Privada>
          }
        />
        <Route path="hoy" element={<Hoy />} />
        <Route path="pedir" element={<Pedir />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
