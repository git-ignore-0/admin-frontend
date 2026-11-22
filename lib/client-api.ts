import { isRequestCanceled } from "@/lib/client-error";
import { ADMIN_PAGE_SESSION_HEADER } from "@/lib/csrf";

export const ADMIN_SESSION_CHANGED_EVENT = "nfv-admin-session-changed";

function notifySessionChanged(code: string, sessionBinding: string | undefined) {
  if (code === "session_changed") {
    window.dispatchEvent(new CustomEvent(ADMIN_SESSION_CHANGED_EVENT, { detail: sessionBinding }));
  }
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

async function fetchBackend(path: string, init: RequestInit) {
  init.signal?.throwIfAborted();
  try {
    return await fetch(`/api/backend/${path.replace(/^\//, "")}`, init);
  } catch (error) {
    if (isRequestCanceled(error, init.signal)) throw error;
    throw new Error("network_error");
  }
}

async function readJsonPayload(response: Response, signal?: AbortSignal | null) {
  try {
    return await response.json();
  } catch (error) {
    if (isRequestCanceled(error, signal)) throw error;
    // Keep the empty/invalid JSON fallback and the status fallback for HTTP errors.
    if (error instanceof SyntaxError || !response.ok) return {};
    throw error;
  }
}

function enforceSession(response: Response, binding: string | undefined, options?: ApiOptions) {
  if (response.status !== 401) return;
  if (renderedSessionBinding() === binding && (options?.shouldRedirectToLogin?.() ?? true)) {
    window.location.assign(`/login?returnTo=${encodeURIComponent(window.location.pathname)}`);
  }
  throw new Error("session_expired");
}

export function firstValidationField(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const field = firstValidationField(item);
      if (field) return field;
    }
    return undefined;
  }
  if (!value || typeof value !== "object") return undefined;
  for (const [key, item] of Object.entries(value)) {
    if (["detail", "error", "errors"].includes(key)) continue;
    const nested = firstValidationField(item);
    return nested || key;
  }
  return undefined;
}

export type ApiEnvelope<T, M = Record<string, unknown>> = { data: T; meta?: M };
type ApiOptions = { shouldRedirectToLogin?: () => boolean };

export async function apiEnvelope<T, M = Record<string, unknown>>(
  path: string,
  init?: RequestInit,
  options?: ApiOptions,
): Promise<ApiEnvelope<T, M>> {
  const method = (init?.method || "GET").toUpperCase();
  const mutatesData = !["GET", "HEAD", "OPTIONS"].includes(method);
  const binding = pageSessionBinding();
  const headers = new Headers(init?.headers);
  if (!headers.has("content-type") && !(init?.body instanceof FormData)) {
    headers.set("content-type", "application/json");
  }
  if (mutatesData) headers.set("x-nfv-admin-request", "1");
  applySessionHeader(headers, binding);
  const response = await fetchBackend(path, { ...init, headers });
  enforceSession(response, binding, options);
  const payload = await readJsonPayload(response, init?.signal);
  if (!response.ok) {
    const field = firstValidationField(payload);
    const code =
      payload?.errors?.[0]?.code ||
      payload?.error ||
      (response.status === 400 ? "validation_error" : undefined) ||
      (response.status === 403 ? "forbidden" : undefined) ||
      (response.status >= 500 ? "server_error" : undefined) ||
      "request_failed";
    notifySessionChanged(code, binding);
    const error = new Error(code);
    Object.assign(error, { status: response.status, payload, field });
    throw error;
  }
  return payload as ApiEnvelope<T, M>;
}

export async function api<T>(path: string, init?: RequestInit, options?: ApiOptions): Promise<T> {
  return (await apiEnvelope<T>(path, init, options)).data;
}

export async function apiFile(path: string, { signal }: Pick<RequestInit, "signal"> = {}) {
  const binding = pageSessionBinding();
  const headers = new Headers();
  applySessionHeader(headers, binding);
  const response = await fetchBackend(path, { cache: "no-store", headers, signal });
  enforceSession(response, binding);
  if (!response.ok) {
    const payload = await readJsonPayload(response, signal);
    const code = payload?.errors?.[0]?.code || payload?.error || "request_failed";
    notifySessionChanged(code, binding);
    const error = new Error(code);
    Object.assign(error, { status: response.status, payload });
    throw error;
  }
  if (!response.headers.get("content-type")?.startsWith("application/pdf")) {
    throw Object.assign(new Error("csa_contract_pdf_unavailable"), { status: 502 });
  }
  return {
    blob: await response.blob(),
    filename:
      response.headers.get("content-disposition")?.match(/filename="?([^";]+)"?/i)?.[1] ??
      "csa-contract.pdf",
  };
}
