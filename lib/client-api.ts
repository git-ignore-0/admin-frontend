import {
  invalidApiResponse,
  isApiObject,
  isNativeRequestTimeout,
  isRequestCanceled,
} from "@/lib/client-error";
import { ADMIN_PAGE_SESSION_HEADER } from "@/lib/csrf";

export const ADMIN_SESSION_CHANGED_EVENT = "nfv-admin-session-changed";

function notifySessionChanged(sessionBinding: string | undefined) {
  window.dispatchEvent(new CustomEvent(ADMIN_SESSION_CHANGED_EVENT, { detail: sessionBinding }));
}

function renderedSessionBinding() {
  return document.querySelector<HTMLElement>("[data-admin-session]")?.dataset.adminSession;
}

export function pageSessionBinding(marker = renderedSessionBinding()) {
  if (!marker) return undefined;
  // A partial navigation can render a new shell while work from the previous login
  // still exists in this document. Only a full reload can use the new page binding.
  document.documentElement.dataset.adminPageSession ??= marker;
  return document.documentElement.dataset.adminPageSession;
}

function applySessionHeader(headers: Headers, binding: string | undefined) {
  if (binding) headers.set(ADMIN_PAGE_SESSION_HEADER, binding);
  else headers.delete(ADMIN_PAGE_SESSION_HEADER);
}

function transportError(error: unknown, signal?: AbortSignal | null) {
  if (isRequestCanceled(error, signal)) return error;
  return new Error(isNativeRequestTimeout(error) ? "request_timeout" : "network_error");
}

async function fetchBackend(
  path: string,
  init: RequestInit,
  binding: string | undefined,
  options?: ApiOptions,
) {
  let response: Response;
  try {
    init.signal?.throwIfAborted();
    response = await fetch(`/api/backend/${path.replace(/^\//, "")}`, init);
  } catch (error) {
    throw transportError(error, init.signal);
  }
  enforceSession(response, binding, options);
  if (!response.ok) throw await readHttpError(response, binding, init.signal);
  return response;
}

function mediaType(response: Response) {
  return response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
}

function enforceSession(response: Response, binding: string | undefined, options?: ApiOptions) {
  if (response.status !== 401) return;
  const shouldRedirect =
    renderedSessionBinding() === binding && (options?.shouldRedirectToLogin?.() ?? true);
  // Retire protected caches even when an obsolete operation opts out of redirecting.
  if (binding) notifySessionChanged(binding);
  if (shouldRedirect) {
    window.location.assign(`/login?returnTo=${encodeURIComponent(window.location.pathname)}`);
  }
  throw Object.assign(new Error("session_expired"), { status: response.status });
}

const nonValidationKeys = new Set([
  "detail",
  "error",
  "errors",
  "non_field_errors",
  "meta",
  "context",
  "status_code",
]);
const errorMetadataKeys = new Set(["code", "status", "type", "title", "message", "instance"]);

export function firstValidationField(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const field = firstValidationField(item);
      if (field) return field;
    }
    return undefined;
  }
  if (!isApiObject(value)) return undefined;
  for (const [key, item] of Object.entries(value)) {
    if (nonValidationKeys.has(key)) continue;
    if (
      typeof item === "string" ||
      (Array.isArray(item) && item.some((v) => typeof v === "string"))
    ) {
      return key;
    }
    const nested = firstValidationField(item);
    if (nested) return nested;
  }
  return undefined;
}

function fallbackErrorCode(status: number) {
  if (status === 400) return "validation_error";
  if (status === 403) return "forbidden";
  if (status === 504) return "upstream_timeout";
  return status >= 500 ? "server_error" : "request_failed";
}

async function readHttpError(
  response: Response,
  binding: string | undefined,
  signal?: AbortSignal | null,
) {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    if (isRequestCanceled(error, signal)) throw error;
    if (isNativeRequestTimeout(error)) {
      throw Object.assign(new Error("request_timeout"), { status: response.status });
    }
    // An unreadable HTTP error still has a meaningful status.
  }
  const body = isApiObject(payload) ? payload : {};
  const firstError = Array.isArray(body.errors) ? body.errors[0] : undefined;
  const entry = isApiObject(firstError) ? firstError : {};
  const code =
    [entry.code, body.error].find(
      (value): value is string => typeof value === "string" && value.trim().length > 0,
    ) ?? fallbackErrorCode(response.status);

  let field: string | undefined;
  if (code === "validation_error") {
    field =
      firstValidationField(entry.fields) ??
      firstValidationField(
        Object.fromEntries(Object.entries(body).filter(([key]) => !errorMetadataKeys.has(key))),
      );
  }
  if (code === "session_changed") notifySessionChanged(binding);
  return Object.assign(new Error(code), { status: response.status, payload: body, field });
}

export type ApiEnvelope<T, M = Record<string, unknown>> = { data: T; meta?: M };
type ApiOptions = { shouldRedirectToLogin?: () => boolean };
type JsonApiOptions = ApiOptions & { response?: never };
type NoContentApiOptions = ApiOptions & { response: "no-content" };

async function fetchApiResponse(path: string, init?: RequestInit, options?: ApiOptions) {
  const method = (init?.method || "GET").toUpperCase();
  const mutatesData = !["GET", "HEAD", "OPTIONS"].includes(method);
  const binding = pageSessionBinding();
  const headers = new Headers(init?.headers);
  if (!headers.has("content-type") && !(init?.body instanceof FormData)) {
    headers.set("content-type", "application/json");
  }
  if (mutatesData) headers.set("x-nfv-admin-request", "1");
  applySessionHeader(headers, binding);
  return fetchBackend(path, { ...init, headers }, binding, options);
}

export async function apiEnvelope<T, M = Record<string, unknown>>(
  path: string,
  init?: RequestInit,
  options?: JsonApiOptions,
): Promise<ApiEnvelope<T, M>> {
  const response = await fetchApiResponse(path, init, options);
  if (response.status === 204 || mediaType(response) !== "application/json") {
    throw invalidApiResponse(response.status);
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    if (error instanceof SyntaxError && !isRequestCanceled(error, init?.signal)) {
      throw invalidApiResponse(response.status);
    }
    throw transportError(error, init?.signal);
  }
  if (!isApiObject(payload) || !Object.hasOwn(payload, "data") || payload.data == null) {
    throw invalidApiResponse(response.status);
  }
  // Domain callers validate the specific data and metadata they depend on.
  return payload as ApiEnvelope<T, M>;
}

export function api(
  path: string,
  init: RequestInit | undefined,
  options: NoContentApiOptions,
): Promise<void>;
export function api<T>(path: string, init?: RequestInit, options?: JsonApiOptions): Promise<T>;
export async function api<T>(
  path: string,
  init?: RequestInit,
  options?: JsonApiOptions | NoContentApiOptions,
): Promise<T | void> {
  if (options?.response === "no-content") {
    const response = await fetchApiResponse(path, init, options);
    if (response.status !== 204 || response.body !== null) {
      throw invalidApiResponse(response.status);
    }
    return;
  }
  return (await apiEnvelope<T>(path, init, options)).data;
}

export async function apiFile(path: string, { signal }: Pick<RequestInit, "signal"> = {}) {
  const binding = pageSessionBinding();
  const headers = new Headers();
  applySessionHeader(headers, binding);
  const response = await fetchBackend(path, { cache: "no-store", headers, signal }, binding);
  if (response.body === null || mediaType(response) !== "application/pdf") {
    throw Object.assign(new Error("csa_contract_pdf_unavailable"), { status: 502 });
  }
  let blob: Blob;
  try {
    blob = await response.blob();
  } catch (error) {
    throw transportError(error, signal);
  }
  return {
    blob,
    filename:
      response.headers.get("content-disposition")?.match(/filename="?([^";]+)"?/i)?.[1] ??
      "csa-contract.pdf",
  };
}
