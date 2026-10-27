/**
 * URL base de la API.
 *
 * En producción nginx hace proxy de `/api` al backend, así que basta la ruta
 * relativa. En desarrollo Vite ya proxeya `/api` (ver vite.config.ts), de modo
 * que VITE_API_URL solo hace falta si el API vive en otro host.
 */
const API_BASE_URL: string = import.meta.env.VITE_API_URL ?? "";

/** Error de API con el código estable que el backend devuelve. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** El backend responde 422 con la lista de campos que fallaron. */
  get isValidation(): boolean {
    return this.code === "VALIDATION_ERROR";
  }

  get isAuth(): boolean {
    return this.code === "UNAUTHENTICATED";
  }

  get isRateLimited(): boolean {
    return this.code === "RATE_LIMITED";
  }
}

const ACCESS_TOKEN_KEY = "kairo.access";

/** Lee una cookie no HttpOnly (la de CSRF, que el navegador expone a JS). */
export function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function getAccessToken(): string | null {
  return sessionStorage.getItem(ACCESS_TOKEN_KEY);
}

/**
 * El access token vive en sessionStorage, no en localStorage: se descarta al
 * cerrar la pestaña y no queda expuesto ante un XSS persistente.
 */
export function setAccessToken(token: string | null): void {
  if (token) sessionStorage.setItem(ACCESS_TOKEN_KEY, token);
  else sessionStorage.removeItem(ACCESS_TOKEN_KEY);
}

interface RefreshResponse {
  user: { id: number; nombre: string; email: string; rol: string };
  accessToken: string;
}

let refreshing: Promise<string | null> | null = null;

/**
 * Renueva el access token usando la cookie de refresco (HttpOnly, invisible
 * para JS). Varias peticiones que expiren a la vez comparten una sola renovación.
 */
async function refreshAccessToken(): Promise<string | null> {
  refreshing ??= (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) return null;
      const data = (await response.json()) as RefreshResponse;
      setAccessToken(data.accessToken);
      return data.accessToken;
    } catch {
      return null;
    } finally {
      // Libera la promesa compartida en el siguiente turno para no dejar el
      // cliente bloqueado si el refresh falló.
      queueMicrotask(() => {
        refreshing = null;
      });
    }
  })();
  return refreshing;
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  /** Uso interno: evita bucles infinitos de reintento tras un refresh fallido. */
  _retry?: boolean;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, _retry = false, headers, ...rest } = options;

  const finalHeaders = new Headers(headers);
  if (body !== undefined && !(body instanceof FormData)) {
    finalHeaders.set("Content-Type", "application/json");
  }

  const token = getAccessToken();
  if (token) finalHeaders.set("Authorization", `Bearer ${token}`);

  // Doble cookie CSRF: la cookie es legible por JS y se copia a la cabecera.
  if (rest.method && rest.method !== "GET" && rest.method !== "HEAD") {
    const csrf = readCookie("kairo.csrf");
    if (csrf) finalHeaders.set("X-XSRF-TOKEN", csrf);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    headers: finalHeaders,
    credentials: "include",
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  });

  if (response.status === 401 && !_retry) {
    const nuevo = await refreshAccessToken();
    if (nuevo) {
      return apiRequest<T>(path, { ...options, _retry: true });
    }
    setAccessToken(null);
  }

  if (response.status === 204) return undefined as T;

  const texto = await response.text();
  const cuerpo: unknown = texto ? JSON.parse(texto) : null;

  if (!response.ok) {
    const error = cuerpo as { error?: { code?: string; message?: string; details?: unknown } } | null;
    throw new ApiError(
      response.status,
      error?.error?.code ?? "UNKNOWN",
      error?.error?.message ?? `Error ${response.status}`,
      error?.error?.details,
    );
  }

  return cuerpo as T;
}

/**
 * Detalle de validación de la API.
 *
 * El backend responde 422 con una lista de `{ path, message, code }`. Este
 * helper la convierte en un mapa campo -> mensaje, que es lo que los
 * formularios necesitan para señalar el campo culpable.
 */
export function detalleValidacion(details: unknown): Record<string, string> {
  if (!Array.isArray(details)) return {};
  const mapa: Record<string, string> = {};
  for (const item of details) {
    if (typeof item === "object" && item !== null) {
      const registro = item as { path?: unknown; message?: unknown };
      if (typeof registro.path === "string" && typeof registro.message === "string") {
        mapa[registro.path] = registro.message;
      }
    }
  }
  return mapa;
}

export const api = {
  get: <T>(path: string) => apiRequest<T>(path, { method: "GET" }),
  post: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: "POST", body }),
  patch: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: "PATCH", body }),
  put: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: "PUT", body }),
  delete: <T>(path: string) => apiRequest<T>(path, { method: "DELETE" }),
};