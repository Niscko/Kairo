/**
 * Jerarquía de errores de la aplicación.
 *
 * Todo error que llega al cliente se representa con un `AppError`. Cualquier
 * otro valor que escape de un handler se trata como 500 y se registra como
 * fallo no previsto: nunca se filtra el mensaje interno al cliente.
 */

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

/** Código estable que el frontend traduce con i18n; nunca el mensaje en crudo. */
export interface AppErrorOptions {
  code: ErrorCode;
  status: number;
  message: string;
  details?: unknown;
  cause?: unknown;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: unknown;

  constructor(options: AppErrorOptions) {
    super(options.message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = new.target.name;
    this.code = options.code;
    this.status = options.status;
    this.details = options.details;
    Error.captureStackTrace?.(this, new.target);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super({ code: "VALIDATION_ERROR", status: 422, message, details });
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = "No autenticado") {
    super({ code: "UNAUTHENTICATED", status: 401, message });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "No autorizado") {
    super({ code: "FORBIDDEN", status: 403, message });
  }
}

export class NotFoundError extends AppError {
  constructor(recurso: string) {
    super({ code: "NOT_FOUND", status: 404, message: `${recurso} no encontrado` });
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super({ code: "CONFLICT", status: 409, message, details });
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Demasiadas solicitudes") {
    super({ code: "RATE_LIMITED", status: 429, message });
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}