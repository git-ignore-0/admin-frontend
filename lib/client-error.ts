import type { AdminDictionary } from "@/lib/admin-i18n";

export function isApiObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isNativeRequestTimeout(error: unknown): boolean {
  return (
    isApiObject(error) &&
    error.name === "TimeoutError" &&
    Object.prototype.toString.call(error) === "[object DOMException]"
  );
}

/** Recognize native aborts and caller-supplied abort reasons without hiding concurrent failures. */
export function isRequestCanceled(error: unknown, signal?: AbortSignal | null): boolean {
  if (isNativeRequestTimeout(error)) return false;
  return (
    (isApiObject(error) && error.name === "AbortError") ||
    (signal?.aborted === true && Object.is(signal.reason, error))
  );
}

export type ClientApiError = Error & {
  field?: string;
  status?: number;
  payload?: {
    errors?: Array<{ code?: string; context?: unknown; fields?: Record<string, unknown> }>;
  };
};

/** A response can violate its contract even when HTTP reports success. */
export function invalidApiResponse(status?: number): ClientApiError {
  const error = new Error("invalid_response") as ClientApiError;
  if (status !== undefined) error.status = status;
  return error;
}

export function apiErrorContext<T>(caught: unknown): T | null {
  if (!(caught instanceof Error)) return null;
  return ((caught as ClientApiError).payload?.errors?.[0]?.context as T | undefined) ?? null;
}

export function apiErrorFields(caught: unknown): Record<string, unknown> {
  if (!(caught instanceof Error)) return {};
  const fields = (caught as ClientApiError).payload?.errors?.[0]?.fields;
  return isApiObject(fields) ? fields : {};
}

export function requestErrorMessage(
  caught: unknown,
  t: AdminDictionary,
  fieldLabels: Record<string, string> = {},
) {
  if (!(caught instanceof Error)) return t.common.requestFailed;
  const error = caught as ClientApiError;
  if (error.message === "invalid_response") return t.common.invalidResponse;
  if (error.message === "network_error") return t.common.networkError;
  if (error.message === "request_timeout" || error.message === "upstream_timeout") {
    return t.common.requestTimeout;
  }
  if (error.message === "forbidden" || error.message === "csrf_rejected") {
    return t.common.forbidden;
  }
  if (
    error.message === "upstream_unavailable" ||
    error.message === "server_error" ||
    (error.status && error.status >= 500)
  ) {
    return t.common.serverError;
  }
  if (error.message === "validation_error") {
    return error.field
      ? t.common.invalidField.replace("{field}", fieldLabels[error.field] || error.field)
      : t.common.invalidData;
  }
  return t.common.requestFailed;
}
