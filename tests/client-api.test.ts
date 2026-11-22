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

it("preserves a caller reason object even when its name resembles a native deadline", async () => {
  const fetcher = mockFetch();
  const reason = { name: "TimeoutError", source: "superseded" };
  const signal = AbortSignal.abort(reason);
  await expect(api("admin/users", { signal })).rejects.toBe(reason);
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
      headers: { "Content-Type": bodyKind === "json" ? "application/json" : "application/pdf" },
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

it.each([
  ["unexpected 204", () => new Response(null, { status: 204 }), 204],
  [
    "empty JSON",
    () => new Response(null, { headers: { "Content-Type": "application/json" } }),
    200,
  ],
  [
    "malformed JSON",
    () => new Response("{", { headers: { "Content-Type": "application/json" } }),
    200,
  ],
  [
    "unexpected MIME",
    () => new Response('{"data":[]}', { headers: { "Content-Type": "text/html" } }),
    200,
  ],
  [
    "malformed MIME",
    () => new Response('{"data":[]}', { headers: { "Content-Type": "invalid+json" } }),
    200,
  ],
  ["null envelope", () => Response.json(null), 200],
  ["array envelope", () => Response.json([]), 200],
  ["primitive envelope", () => Response.json(1), 200],
  ["missing data", () => Response.json({ meta: {} }), 200],
  ["null data", () => Response.json({ data: null }), 200],
])("rejects %s for a JSON operation", async (_label, response, status) => {
  mockFetch().mockResolvedValue(response());
  await expect(apiEnvelope("admin/users")).rejects.toMatchObject({
    message: "invalid_response",
    status,
  });
});

it("preserves JSON 200/201, zero totals, unpaginated arrays and additional envelope fields", async () => {
  const payload = { data: [], meta: { total: 0, idempotent_replay: true }, demand: { total: 0 } };
  mockFetch()
    .mockResolvedValueOnce(
      Response.json(payload, { headers: { "Content-Type": "Application/JSON; charset=utf-8" } }),
    )
    .mockResolvedValueOnce(Response.json({ data: { id: "created" } }, { status: 201 }))
    .mockResolvedValueOnce(Response.json({ data: [] }));
  await expect(apiEnvelope("admin/users")).resolves.toEqual(payload);
  await expect(api("admin/users", { method: "POST" })).resolves.toEqual({ id: "created" });
  await expect(api("administrative-units/provinces")).resolves.toEqual([]);
});

it("handles explicit 204 without trying to parse JSON and rejects an unexpected success response", async () => {
  const noContent = new Response(null, { status: 204 });
  const parse = vi.spyOn(noContent, "json");
  const fetcher = mockFetch()
    .mockResolvedValueOnce(noContent)
    .mockResolvedValueOnce(Response.json({ data: {} }));
  const remove = () =>
    api(
      "admin/farms/media/fixture",
      { method: "DELETE", keepalive: true },
      {
        response: "no-content",
      },
    );
  await expect(remove()).resolves.toBeUndefined();
  expect(parse).not.toHaveBeenCalled();
  expect(fetcher.mock.calls[0][1]).toMatchObject({ method: "DELETE", keepalive: true });
  await expect(remove()).rejects.toMatchObject({ message: "invalid_response", status: 200 });
});

it("rejects a malformed successful mutation response without retrying or losing request headers", async () => {
  const fetcher = mockFetch().mockResolvedValue(
    new Response("{", { status: 201, headers: { "Content-Type": "application/json" } }),
  );
  await expect(
    api("admin/membership-usage", {
      method: "POST",
      headers: { "Idempotency-Key": "existing-operation-key" },
      body: "{}",
    }),
  ).rejects.toMatchObject({ message: "invalid_response", status: 201 });
  expect(fetcher).toHaveBeenCalledOnce();
  expect(new Headers(fetcher.mock.calls[0][1].headers).get("Idempotency-Key")).toBe(
    "existing-operation-key",
  );
});

it.each(["json", "blob"] as const)(
  "reports an interrupted %s response as a connection failure",
  async (kind) => {
    const response = new Response(
      new ReadableStream({ start: (stream) => stream.error(new TypeError("interrupted body")) }),
      { headers: { "Content-Type": kind === "json" ? "application/json" : "application/pdf" } },
    );
    mockFetch().mockResolvedValue(response);
    const pending = kind === "json" ? apiEnvelope("admin/users") : apiFile(pdfPath);
    await expect(pending).rejects.toThrow("network_error");
  },
);

it("reports a native deadline before fetch and keeps the native reason out of cancellation", async () => {
  const fetcher = mockFetch();
  const signal = AbortSignal.timeout(0);
  await new Promise<void>((resolve) =>
    signal.addEventListener("abort", () => resolve(), { once: true }),
  );
  expect(isRequestCanceled(signal.reason, signal)).toBe(false);
  await expect(api("admin/users", { signal })).rejects.toThrow("request_timeout");
  await expect(apiFile(pdfPath, { signal })).rejects.toThrow("request_timeout");
  expect(fetcher).not.toHaveBeenCalled();
});

it.each(["fetch", "json", "blob"] as const)(
  "reports a native deadline during %s",
  async (stage) => {
    const deadline = new DOMException("deadline", "TimeoutError");
    const controller = new AbortController();
    const response = abortableResponse(controller.signal, {
      headers: { "Content-Type": stage === "blob" ? "application/pdf" : "application/json" },
    });
    mockFetch().mockImplementation(() =>
      stage === "fetch"
        ? new Promise((_resolve, reject) =>
            controller.signal.addEventListener("abort", () => reject(deadline), { once: true }),
          )
        : Promise.resolve(response),
    );
    const request =
      stage === "blob"
        ? apiFile(pdfPath, { signal: controller.signal })
        : apiEnvelope("admin/users", { signal: controller.signal });
    if (stage !== "fetch") await vi.waitFor(() => expect(response.bodyUsed).toBe(true));
    controller.abort(deadline);
    const error = await request.catch((caught) => caught);
    expect(error).toMatchObject({ message: "request_timeout" });
    expect(isRequestCanceled(error, controller.signal)).toBe(false);
  },
);

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
          "Content-Type": "Application/PDF; charset=binary",
          "Content-Disposition": 'attachment; filename="sample.pdf"',
        },
      }),
    )
    .mockResolvedValueOnce(
      new Response("unexpected", { headers: { "Content-Type": "application/pdf-invalid" } }),
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

it("rejects a no-content result for a PDF read", async () => {
  mockFetch().mockResolvedValue(
    new Response(null, {
      status: 204,
      headers: { "Content-Type": "application/pdf" },
    }),
  );
  await expect(apiFile(pdfPath)).rejects.toMatchObject({
    message: "csa_contract_pdf_unavailable",
    status: 502,
  });
});

it("preserves HTTP error codes, validation details and localization", async () => {
  const context = { detail: "sample context" };
  const fields = { name: ["required"] };
  const payload = { errors: [{ code: "validation_error", context, fields }] };
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

it("uses DRF validation fields without interpreting non-field errors or metadata as fields", async () => {
  mockFetch()
    .mockResolvedValueOnce(
      Response.json(
        {
          non_field_errors: ["generic"],
          meta: { ignored: "value" },
          translations: [{ body: ["required"] }],
        },
        { status: 400 },
      ),
    )
    .mockResolvedValueOnce(
      Response.json(
        {
          non_field_errors: ["generic"],
          context: { ignored: "value" },
          detail: "invalid",
        },
        { status: 400 },
      ),
    );
  await expect(api("admin/users")).rejects.toMatchObject({
    status: 400,
    message: "validation_error",
    field: "body",
  });
  const error = await api("admin/users").catch((caught) => caught);
  expect(error).toMatchObject({ status: 400, message: "validation_error" });
  expect(error).not.toHaveProperty("field", expect.anything());
});

it.each([
  { email: [{ code: "unique", message: "Already in use" }] },
  {
    non_field_errors: [{ code: "invalid", message: "General" }],
    contact: [{ metadata: null, email: [{ code: "unique", message: "Already in use" }] }],
  },
])("keeps the field name for structured validation issues", async (fields) => {
  const context = { source: "account" };
  mockFetch().mockResolvedValue(
    Response.json(
      {
        errors: [{ code: "validation_error", fields, context }],
      },
      { status: 400 },
    ),
  );
  const error = await api("admin/users").catch((caught) => caught);
  expect(error).toMatchObject({ status: 400, message: "validation_error", field: "email" });
  expect(apiErrorFields(error)).toEqual(fields);
  expect(apiErrorContext(error)).toEqual(context);
});

it("preserves a business conflict and ignores malformed fields", async () => {
  const context = { conflict: true };
  mockFetch().mockResolvedValue(
    Response.json(
      {
        errors: [{ code: "resolution_conflict", context, fields: "invalid" }],
      },
      { status: 409 },
    ),
  );
  const error = await api("admin/csa-purchase-requests").catch((caught) => caught);
  expect(error).toMatchObject({ status: 409, message: "resolution_conflict" });
  expect(error).not.toHaveProperty("field", expect.anything());
  expect(apiErrorFields(error)).toEqual({});
  expect(apiErrorContext(error)).toEqual(context);
});

it.each([
  [403, "forbidden"],
  [404, "request_failed"],
  [502, "server_error"],
  [504, "upstream_timeout"],
])("classifies unexpected PDF error payloads with HTTP %i", async (status, message) => {
  mockFetch().mockResolvedValue(Response.json({ error: {}, errors: [{ code: 7 }] }, { status }));
  await expect(apiFile(pdfPath)).rejects.toMatchObject({ status, message });
});

it("keeps the observed HTTP status when a deadline interrupts its error body", async () => {
  const controller = new AbortController();
  const response = abortableResponse(controller.signal, { status: 403 });
  mockFetch().mockResolvedValue(response);
  const pending = apiFile(pdfPath, { signal: controller.signal });
  await vi.waitFor(() => expect(response.bodyUsed).toBe(true));
  controller.abort(new DOMException("deadline", "TimeoutError"));
  await expect(pending).rejects.toMatchObject({ status: 403, message: "request_timeout" });
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
