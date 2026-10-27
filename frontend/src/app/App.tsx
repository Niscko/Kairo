import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "sonner";

import { Rutas } from "@/app/Rutas";
import { ProveedorSesion } from "@/features/auth/Sesion";
import { cn } from "@/lib/utils";
import "@/i18n";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Los datos del local cambian por minutos, no por segundos.
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      retry: (failureCount, error) => {
        // Reintentar un 401/403/422 solo retrasa el error visible.
        const status = (error as { status?: number }).status;
        if (status && status >= 400 && status < 500) return false;
        return failureCount < 2;
      },
    },
  },
});

interface BoundaryState {
  error: Error | null;
}

/**
 * Aísla los fallos de render para que un módulo roto no deje la aplicación
 * completamente en blanco.
 */
class ErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  override state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // El logger de la app aún no existe en esta fase; console queda como
    // placeholder hasta que se conecte el reporte de errores.
    console.error("Fallo al renderizar un componente", error, info.componentStack);
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md space-y-4 text-center">
          <h1 className="font-display text-2xl font-semibold">Algo salió mal</h1>
          <p className="text-muted-foreground">{this.state.error.message}</p>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className={cn(
              "inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground",
              "transition-colors hover:bg-primary/90",
            )}
          >
            Reintentar
          </button>
        </div>
      </main>
    );
  }
}

export function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ProveedorSesion>
          <BrowserRouter>
            <Rutas />
          </BrowserRouter>
          <Toaster position="bottom-right" richColors closeButton />
        </ProveedorSesion>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
