import { afterEach, expect, it, vi } from "vitest";
import { ADMIN_SESSION_CHANGED_EVENT, api, apiEnvelope, apiFile } from "@/lib/client-api";
import {
  apiErrorContext,
  apiErrorFields,
  isRequestCanceled,
  requestErrorMessage,
} from "@/lib/client-error";
import { adminDictionaries } from "@/lib/admin-i18n";

const pdfPath = "admin/memberships/fixture/contract/pdf?locale=en";

function mockFetch(implementation?: (url: string, init: RequestInit) => Promise<Response>) {
  const fetcher = vi.fn(implementation);
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

function abortableResponse(signal: AbortSignal, init: ResponseInit) {
  const body = new ReadableStream({
    start(stream) {
      signal.addEventListener("abort", () => stream.error(signal.reason), { once: true });
    },
  });
  return new Response(body, init);
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
  delete document.documentElement.dataset.adminPageSession;
});

it("rejects pre-aborted JSON and PDF reads without dispatching fetch", async () => {
  const fetcher = mockFetch();
  const reason = new Error("superseded");
  const signal = AbortSignal.abort(reason);
  await expect(api("admin/users", { signal })).rejects.toBe(reason);
  await expect(apiFile(pdfPath, { signal })).rejects.toBe(reason);
  expect(isRequestCanceled(reason, signal)).toBe(true);
  expect(fetcher).not.toHaveBeenCalled();
});

it("preserves a cancellation during fetch and keeps a racing transport failure distinct", async () => {
  const controller = new AbortController();
  const fetcher = mockFetch(
    (_url, { signal }) =>
      new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
      }),
  );
  const request = apiEnvelope("admin/users", { signal: controller.signal });
  controller.abort();
  await expect(request).rejects.toBe(controller.signal.reason);
  expect(isRequestCanceled(controller.signal.reason)).toBe(true);

  const racing = new AbortController();
  const failure = new TypeError("network broke");
  fetcher.mockImplementationOnce(() => {
    racing.abort();
    return Promise.reject(failure);
  });
  await expect(api("admin/users", { signal: racing.signal })).rejects.toThrow("network_error");
  expect(isRequestCanceled(failure, racing.signal)).toBe(false);
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it.each(["json", "blob"] as const)(
  "preserves cancellation during %s consumption",
  async (bodyKind) => {
    const controller = new AbortController();
    const response = abortableResponse(controller.signal, {
      headers: { "Content-Type": "application/pdf" },
    });
    mockFetch().mockResolvedValue(response);
    const request =
      bodyKind === "json"
        ? apiEnvelope("admin/users", { signal: controller.signal })
        : apiFile(pdfPath, { signal: controller.signal });
    await vi.waitFor(() => expect(response.bodyUsed).toBe(true));
    controller.abort();
    await expect(request).rejects.toBe(controller.signal.reason);
  },
);

it("retains empty and malformed JSON compatibility while surfacing an interrupted successful body", async () => {
  const failure = new TypeError("interrupted body");
  const incomplete = Response.json({ data: [] });
  vi.spyOn(incomplete, "json").mockRejectedValue(failure);
  mockFetch()
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValueOnce(new Response("malformed"))
    .mockResolvedValueOnce(incomplete);
  await expect(apiEnvelope("admin/users")).resolves.toEqual({});
  await expect(api("admin/users")).resolves.toBeUndefined();
  await expect(apiEnvelope("admin/users")).rejects.toBe(failure);
});

it("preserves RequestInit and header semantics and gives security headers precedence", async () => {
  const marker = document.createElement("div");
  marker.dataset.adminSession = "rendered-session";
  document.body.append(marker);
  const signal = new AbortController().signal;
  const supplied = new Headers({
    "Accept-Language": "vi",
    "X-Custom": "fixture",
    "X-NFV-Admin-Request": "caller-value",
    "X-NFV-Admin-Session": "caller-binding",
  });
  const payload = { data: { ok: true }, meta: { total: 1 } };
  const fetcher = mockFetch().mockImplementation(async () => Response.json(payload));
  await expect(
    apiEnvelope("/admin/users", {
      method: "POST",
      body: "{}",
      signal,
      headers: supplied,
      keepalive: true,
      credentials: "same-origin",
      cache: "no-store",
    }),
  ).resolves.toEqual(payload);
  expect(fetcher).toHaveBeenCalledExactlyOnceWith(
    "/api/backend/admin/users",
    expect.objectContaining({
      method: "POST",
      body: "{}",
      signal,
      keepalive: true,
      credentials: "same-origin",
      cache: "no-store",
    }),
  );
  const headers = new Headers(fetcher.mock.calls[0][1].headers);
  expect(Object.fromEntries(headers)).toEqual({
    "accept-language": "vi",
    "content-type": "application/json",
    "x-custom": "fixture",
    "x-nfv-admin-request": "1",
    "x-nfv-admin-session": "rendered-session",
  });
  expect(supplied.get("x-nfv-admin-session")).toBe("caller-binding");

  const body = new FormData();
  body.set("file", new Blob(["data"]), "sample.png");
  await api("admin/media", { method: "POST", body, headers: [["X-Custom", "multipart"]] });
  const upload = fetcher.mock.calls[1][1];
  expect(upload.body).toBe(body);
  expect(new Headers(upload.headers).get("x-custom")).toBe("multipart");
  expect(new Headers(upload.headers).has("content-type")).toBe(false);
});

it("retains PDF blob, filename, no-store policy, and content-type validation", async () => {
  const signal = new AbortController().signal;
  const fetcher = mockFetch()
    .mockResolvedValueOnce(
      new Response("test pdf", {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": 'attachment; filename="sample.pdf"',
        },
      }),
    )
    .mockResolvedValueOnce(
      new Response("unexpected", { headers: { "Content-Type": "text/html" } }),
    );
  const file = await apiFile(pdfPath, { signal });
  expect(file.filename).toBe("sample.pdf");
  expect(await file.blob.text()).toBe("test pdf");
  expect(fetcher).toHaveBeenCalledWith(
    `/api/backend/${pdfPath}`,
    expect.objectContaining({ signal, cache: "no-store" }),
  );
  await expect(apiFile(pdfPath)).rejects.toMatchObject({
    message: "csa_contract_pdf_unavailable",
    status: 502,
  });
});

it("preserves HTTP error codes, validation details and localization", async () => {
  const context = { detail: "sample context" };
  const fields = { name: ["required"] };
  const payload = { errors: [{ code: "validation_error", context, fields }], name: ["required"] };
  mockFetch()
    .mockResolvedValueOnce(Response.json(payload, { status: 400 }))
    .mockResolvedValueOnce(Response.json({ error: "upstream_timeout" }, { status: 504 }));
  const error = await api("admin/users").catch((caught) => caught);
  expect(error).toMatchObject({ message: "validation_error", status: 400, field: "name", payload });
  expect(apiErrorContext(error)).toEqual(context);
  expect(apiErrorFields(error)).toEqual(fields);
  expect(requestErrorMessage(error, adminDictionaries.en, { name: "Name" })).toBe(
    "Invalid data in field: Name.",
  );
  await expect(api("admin/users")).rejects.toMatchObject({
    message: "upstream_timeout",
    status: 504,
  });
});

it("enforces observed 401 and session_changed responses even if the UI canceled while waiting", async () => {
  const marker = document.createElement("div");
  marker.dataset.adminSession = "rendered-session";
  document.body.append(marker);
  const expired = new AbortController();
  const switched = new AbortController();
  const shouldRedirectToLogin = vi.fn(() => false);
  const listener = vi.fn();
  window.addEventListener(ADMIN_SESSION_CHANGED_EVENT, listener);
  mockFetch()
    .mockImplementationOnce(async () => {
      expired.abort();
      return Response.json({ error: "unauthorized" }, { status: 401 });
    })
    .mockImplementationOnce(async () => {
      switched.abort();
      return Response.json({ error: "session_changed" }, { status: 409 });
    });
  try {
    await expect(
      api("admin/users", { signal: expired.signal }, { shouldRedirectToLogin }),
    ).rejects.toThrow("session_expired");
    expect(shouldRedirectToLogin).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ detail: "rendered-session" }),
    );
    await expect(apiFile(pdfPath, { signal: switched.signal })).rejects.toMatchObject({
      status: 409,
      message: "session_changed",
    });
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenLastCalledWith(
      expect.objectContaining({ detail: "rendered-session" }),
    );
  } finally {
    window.removeEventListener(ADMIN_SESSION_CHANGED_EVENT, listener);
  }
});

it("does not interpret an unreadable 409 body as session replacement", async () => {
  const controller = new AbortController();
  const response = abortableResponse(controller.signal, { status: 409 });
  const listener = vi.fn();
  window.addEventListener(ADMIN_SESSION_CHANGED_EVENT, listener);
  mockFetch().mockResolvedValue(response);
  try {
    const pending = api("admin/users", { signal: controller.signal });
    await vi.waitFor(() => expect(response.bodyUsed).toBe(true));
    controller.abort();
    await expect(pending).rejects.toBe(controller.signal.reason);
    expect(listener).not.toHaveBeenCalled();
  } finally {
    window.removeEventListener(ADMIN_SESSION_CHANGED_EVENT, listener);
  }
});
