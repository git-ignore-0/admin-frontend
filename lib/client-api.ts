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

export async function apiEnvelope<T, M = Record<string, unknown>>(
  path: string,
  init?: RequestInit,
): Promise<ApiEnvelope<T, M>> {
  const method = (init?.method || "GET").toUpperCase();
  const mutatesData = !["GET", "HEAD", "OPTIONS"].includes(method);
  let response: Response;
  try {
    response = await fetch(`/api/backend/${path.replace(/^\//, "")}`, {
      ...init,
      headers: {
        ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
        ...(mutatesData ? { "X-NFV-Admin-Request": "1" } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new Error("network_error");
  }
  if (response.status === 401) {
    window.location.assign(`/login?returnTo=${encodeURIComponent(window.location.pathname)}`);
    throw new Error("session_expired");
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const field = firstValidationField(payload);
    const code =
      payload?.errors?.[0]?.code ||
      payload?.error ||
      (response.status === 400 ? "validation_error" : undefined) ||
      (response.status === 403 ? "forbidden" : undefined) ||
      (response.status >= 500 ? "server_error" : undefined) ||
      "request_failed";
    const error = new Error(code);
    Object.assign(error, { status: response.status, payload, field });
    throw error;
  }
  return payload as ApiEnvelope<T, M>;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  return (await apiEnvelope<T>(path, init)).data;
}

export async function apiFile(path: string) {
  let response: Response;
  try {
    response = await fetch(`/api/backend/${path.replace(/^\//, "")}`, {
      cache: "no-store",
    });
  } catch {
    throw new Error("network_error");
  }
  if (response.status === 401) {
    window.location.assign(`/login?returnTo=${encodeURIComponent(window.location.pathname)}`);
    throw new Error("session_expired");
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const code = payload?.errors?.[0]?.code || payload?.error || "request_failed";
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
