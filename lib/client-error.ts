import type { AdminDictionary } from "@/lib/admin-i18n";

export type ClientApiError = Error & {
  field?: string;
  status?: number;
  payload?: {
    errors?: Array<{ code?: string; context?: unknown; fields?: Record<string, unknown> }>;
  };
};

export function apiErrorContext<T>(caught: unknown): T | null {
  if (!(caught instanceof Error)) return null;
  return ((caught as ClientApiError).payload?.errors?.[0]?.context as T | undefined) ?? null;
}

export function apiErrorFields(caught: unknown): Record<string, unknown> {
  if (!(caught instanceof Error)) return {};
  return (caught as ClientApiError).payload?.errors?.[0]?.fields ?? {};
}

export function requestErrorMessage(
  caught: unknown,
  t: AdminDictionary,
  fieldLabels: Record<string, string> = {},
) {
  if (!(caught instanceof Error)) return t.common.requestFailed;
  const error = caught as ClientApiError;
  if (
    error.message === "network_error" ||
    error.message === "upstream_unavailable" ||
    error.message === "upstream_timeout"
  ) {
    return t.common.networkError;
  }
  if (error.message === "forbidden" || error.message === "csrf_rejected") {
    return t.common.forbidden;
  }
  if (error.message === "server_error" || (error.status && error.status >= 500)) {
    return t.common.serverError;
  }
  if (error.message === "validation_error" && error.field) {
    return t.common.invalidField.replace("{field}", fieldLabels[error.field] || error.field);
  }
  return t.common.requestFailed;
}
