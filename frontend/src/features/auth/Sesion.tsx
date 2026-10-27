import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";

import { api, setAccessToken } from "@/lib/api";
import type { Usuario } from "@/lib/tipos";

interface Sesion {
  usuario: Usuario | null;
  cargando: boolean;
  entrar(email: string, password: string): Promise<void>;
  salir(): Promise<void>;
}

const ContextoSesion = createContext<Sesion | null>(null);

interface RespuestaLogin {
  user: Usuario;
  accessToken: string;
}

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  // /me valida el access token. Si expiró, el cliente HTTP lo renueva solo.
  const me = useQuery({
    queryKey: ["sesion", "me"],
    queryFn: async () => {
      const respuesta = await api.get<{ user: Usuario }>("/api/auth/me");
      return respuesta.user;
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const entrar = useCallback(
    async (email: string, password: string) => {
      const respuesta = await api.post<RespuestaLogin>("/api/auth/login", { email, password });
      setAccessToken(respuesta.accessToken);
      queryClient.setQueryData(["sesion", "me"], respuesta.user);
    },
    [queryClient],
  );

  const salir = useCallback(async () => {
    try {
      await api.post("/api/auth/logout");
    } finally {
      // Aunque el logout falle, la sesión local se cierra: el refresh token
      // puede haber caducado y no debe dejar al usuario "dentro" en la UI.
      setAccessToken(null);
      queryClient.setQueryData(["sesion", "me"], null);
      queryClient.clear();
    }
  }, [queryClient]);

  const valor = useMemo<Sesion>(
    () => ({
      usuario: me.data ?? null,
      cargando: me.isLoading,
      entrar,
      salir,
    }),
    [me.data, me.isLoading, entrar, salir],
  );

  return <ContextoSesion.Provider value={valor}>{children}</ContextoSesion.Provider>;
}

export function useSesion(): Sesion {
  const contexto = useContext(ContextoSesion);
  if (!contexto) {
    throw new Error("useSesion debe usarse dentro de <ProveedorSesion>");
  }
  return contexto;
}

/** Mutación auxiliar para operaciones que invalidan listados. */
export function useInvalidar() {
  const queryClient = useQueryClient();
  return useCallback(
    (...claves: Array<string | string[]>) => {
      for (const clave of claves) {
        void queryClient.invalidateQueries({ queryKey: Array.isArray(clave) ? clave : [clave] });
      }
    },
    [queryClient],
  );
}
