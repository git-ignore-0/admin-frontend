import {
  focusManager,
  onlineManager,
  useQuery,
  useQueryClient,
  type QueryClient,
  type QueryFunctionContext,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { act, cleanup, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { AdminQueryProvider } from "@/components/admin-query-provider";
import { api, apiEnvelope } from "@/lib/client-api";
import { isRequestCanceled, type ClientApiError } from "@/lib/client-error";

const recordKey = ["examples", "detail", "first"] as const;

function QueryView({
  label = "Example record",
  ...options
}: UseQueryOptions<string, ClientApiError> & { label?: string }) {
  const { data, error, fetchStatus } = useQuery(options);
  return (
    <section aria-label={label}>
      {error && <p role="alert">{error.message}</p>}
      {data !== undefined && error?.status !== 403 && <p>{data}</p>}
      <output>{fetchStatus}</output>
    </section>
  );
}

function renderQueries(ui: ReactNode) {
  let client: QueryClient | undefined;

  function CaptureClient() {
    const current = useQueryClient();
    useEffect(() => {
      client = current;
    }, [current]);
    return null;
  }

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <AdminQueryProvider>
        <CaptureClient />
        {children}
      </AdminQueryProvider>
    );
  }

  const view = render(ui, { wrapper: Wrapper });
  if (!client) throw new Error("Missing admin query client");
  return { ...view, client };
}

function mockFetch(implementation?: (url: string, init: RequestInit) => Promise<Response>) {
  const fetcher = vi.fn(implementation);
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

async function advanceTime(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  onlineManager.setOnline(true);
  focusManager.setFocused(undefined);
  delete document.documentElement.dataset.adminPageSession;
});

it("continues one in-flight API read when a second observer of the same key leaves", async () => {
  const pending = deferredResponse();
  const fetcher = mockFetch(() => pending.promise);
  const queryFn = vi.fn(({ signal }: QueryFunctionContext) =>
    api<string>("admin/examples/first", { signal }),
  );
  const observers = (showSecond: boolean) => (
    <>
      <QueryView label="Remaining" queryKey={recordKey} queryFn={queryFn} />
      {showSecond && <QueryView label="Leaving" queryKey={recordKey} queryFn={queryFn} />}
    </>
  );
  const { rerender } = renderQueries(observers(true));
  const signal = queryFn.mock.calls[0][0].signal;
  expect(fetcher).toHaveBeenCalledExactlyOnceWith(
    "/api/backend/admin/examples/first",
    expect.objectContaining({ signal }),
  );
  expect(
    within(screen.getByRole("region", { name: "Remaining" })).getByRole("status"),
  ).toHaveTextContent("fetching");
  expect(
    within(screen.getByRole("region", { name: "Leaving" })).getByRole("status"),
  ).toHaveTextContent("fetching");

  rerender(observers(false));
  expect(screen.queryByRole("region", { name: "Leaving" })).toBeNull();
  expect(signal.aborted).toBe(false);
  pending.resolve(Response.json({ data: "Shared result" }));

  expect(await screen.findByText("Shared result")).toBeVisible();
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("keeps fresh data across observer remounts and revalidates after its configured stale time", async () => {
  vi.useFakeTimers();
  const pending = deferredResponse();
  const fetcher = mockFetch()
    .mockResolvedValueOnce(Response.json({ data: "Cached record" }))
    .mockReturnValueOnce(pending.promise);
  const query = (
    <QueryView
      queryKey={recordKey}
      queryFn={({ signal }) => api<string>("admin/examples/first", { signal })}
      staleTime={60_000}
    />
  );
  const { rerender } = renderQueries(query);
  await advanceTime(1);
  expect(screen.getByText("Cached record")).toBeVisible();

  rerender(null);
  await advanceTime(30_000);
  rerender(query);
  expect(screen.getByText("Cached record")).toBeVisible();
  expect(fetcher).toHaveBeenCalledTimes(1);

  rerender(null);
  await advanceTime(30_000);
  rerender(query);
  expect(screen.getByText("Cached record")).toBeVisible();
  expect(screen.getByRole("status")).toHaveTextContent("fetching");
  expect(fetcher).toHaveBeenCalledTimes(2);
  pending.resolve(Response.json({ data: "Refreshed record" }));
  await advanceTime(1);
  expect(screen.getByText("Refreshed record")).toBeVisible();
});

it("revalidates default-stale records on mount, focus, and reconnect", async () => {
  const queryFn = vi
    .fn()
    .mockResolvedValueOnce("Original record")
    .mockResolvedValueOnce("Remounted record")
    .mockResolvedValueOnce("Focused record")
    .mockResolvedValueOnce("Reconnected record");
  const query = <QueryView queryKey={recordKey} queryFn={queryFn} />;
  const { rerender } = renderQueries(query);
  expect(await screen.findByText("Original record")).toBeVisible();

  rerender(null);
  rerender(query);
  expect(await screen.findByText("Remounted record")).toBeVisible();

  focusManager.setFocused(false);
  focusManager.setFocused(true);
  expect(await screen.findByText("Focused record")).toBeVisible();

  onlineManager.setOnline(false);
  onlineManager.setOnline(true);
  expect(await screen.findByText("Reconnected record")).toBeVisible();
});

it("pauses reads that start offline until reconnection", async () => {
  onlineManager.setOnline(false);
  const queryFn = vi.fn(async () => "Online record");
  renderQueries(<QueryView queryKey={recordKey} queryFn={queryFn} />);
  expect(screen.getByRole("status")).toHaveTextContent("paused");
  expect(queryFn).not.toHaveBeenCalled();

  onlineManager.setOnline(true);
  expect(await screen.findByText("Online record")).toBeVisible();
  expect(queryFn).toHaveBeenCalledTimes(1);
});

it("keeps an active query without polling and collects it five minutes after it becomes inactive", async () => {
  vi.useFakeTimers();
  const queryFn = vi.fn(async () => "Retained record");
  const { client, rerender } = renderQueries(<QueryView queryKey={recordKey} queryFn={queryFn} />);
  await advanceTime(1);
  expect(screen.getByText("Retained record")).toBeVisible();
  await advanceTime(300_000);
  expect(queryFn).toHaveBeenCalledTimes(1);

  rerender(null);
  await advanceTime(299_999);
  expect(client.getQueryData(recordKey)).toBe("Retained record");
  await advanceTime(1);
  expect(client.getQueryState(recordKey)).toBeUndefined();
});

it.each(["fetch", "JSON body"] as const)(
  "aborts the API transport during %s when the final observer leaves",
  async (stage) => {
    let response: Response | undefined;
    const fetcher = mockFetch(async (_url, { signal }) => {
      if (!signal) throw new Error("Missing query signal");
      if (stage === "fetch") {
        return new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        });
      }
      response = new Response(
        new ReadableStream({
          start(stream) {
            signal.addEventListener("abort", () => stream.error(signal.reason), { once: true });
          },
        }),
        { headers: { "Content-Type": "application/json" } },
      );
      return response;
    });
    const queryFn = vi.fn(({ signal }: QueryFunctionContext) =>
      apiEnvelope<string>("admin/examples/first", { signal }).then(({ data }) => data),
    );
    const { client, rerender } = renderQueries(
      <QueryView queryKey={recordKey} queryFn={queryFn} />,
    );
    const signal = queryFn.mock.calls[0][0].signal;
    expect(fetcher.mock.calls[0][1].signal).toBe(signal);
    if (stage === "JSON body") await waitFor(() => expect(response?.bodyUsed).toBe(true));

    const canceledRequest = expect(queryFn.mock.results[0].value).rejects.toSatisfy(
      (error: unknown) => isRequestCanceled(error, signal),
    );
    rerender(null);
    await canceledRequest;
    expect(signal.aborted).toBe(true);
    expect(client.getQueryState(recordKey)).toMatchObject({ error: null, fetchStatus: "idle" });
  },
);

it("isolates a new key from existing data and a late response for the previous key", async () => {
  const oldRefresh = deferredResponse();
  const newRequest = deferredResponse();
  const fetcher = mockFetch()
    .mockResolvedValueOnce(Response.json({ data: "First record" }))
    .mockReturnValueOnce(oldRefresh.promise)
    .mockReturnValueOnce(newRequest.promise);
  const queryFirst = vi.fn(({ signal }: QueryFunctionContext) =>
    api<string>("admin/examples/first", { signal }),
  );
  const secondKey = ["examples", "detail", "second"];
  const { client, rerender } = renderQueries(
    <QueryView queryKey={recordKey} queryFn={queryFirst} />,
  );
  expect(await screen.findByText("First record")).toBeVisible();
  act(() => {
    void client.invalidateQueries({ queryKey: recordKey, exact: true });
  });

  rerender(
    <QueryView
      queryKey={secondKey}
      queryFn={({ signal }) => api<string>("admin/examples/second", { signal })}
    />,
  );
  expect(fetcher.mock.calls[1][1].signal?.aborted).toBe(true);
  expect(screen.queryByText("First record")).toBeNull();
  expect(screen.getByRole("status")).toHaveTextContent("fetching");
  newRequest.resolve(Response.json({ data: "Second record" }));
  expect(await screen.findByText("Second record")).toBeVisible();

  await act(async () => {
    oldRefresh.resolve(Response.json({ data: "Obsolete refresh" }));
    await queryFirst.mock.results[1].value;
  });
  expect(screen.getByText("Second record")).toBeVisible();
  expect(client.getQueryData(recordKey)).toBe("First record");
  expect(client.getQueryData(secondKey)).toBe("Second record");
});

it("preserves distinct network and HTTP errors without retrying failed reads", async () => {
  vi.useFakeTimers();
  const payload = {
    name: ["required"],
    errors: [
      { code: "validation_error", context: { source: "fixture" }, fields: { name: ["required"] } },
    ],
  };
  const fetcher = mockFetch(async (url) => {
    if (url.endsWith("/offline")) throw new TypeError("connection lost");
    return Response.json(payload, { status: 400 });
  });
  const { result } = renderHook(
    () => ({
      network: useQuery({
        queryKey: ["examples", "offline"],
        queryFn: ({ signal }) => api("admin/examples/offline", { signal }),
      }),
      http: useQuery({
        queryKey: ["examples", "http-error"],
        queryFn: ({ signal }) => api("admin/examples/http-error", { signal }),
      }),
    }),
    { wrapper: AdminQueryProvider },
  );
  await advanceTime(60_000);
  expect(result.current.network.error).toMatchObject({ message: "network_error" });
  expect(result.current.network.error).not.toHaveProperty("status");
  expect(result.current.http.error).toMatchObject({
    message: "validation_error",
    status: 400,
    field: "name",
    payload,
  });
  expect(isRequestCanceled(result.current.network.error)).toBe(false);
  expect(isRequestCanceled(result.current.http.error)).toBe(false);
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("invalidates a list prefix and refetches only its active queries by default", async () => {
  const activeKey = ["examples", "list", { page: 1 }];
  const inactiveKey = ["examples", "list", { page: 2 }];
  const active = vi.fn().mockResolvedValueOnce("Old page").mockResolvedValueOnce("Updated page");
  const inactive = vi.fn(async () => "Other page");
  const detail = vi.fn(async () => "Record detail");
  const { client } = renderQueries(
    <>
      <QueryView queryKey={activeKey} queryFn={active} staleTime={Infinity} />
      <QueryView queryKey={recordKey} queryFn={detail} staleTime={Infinity} />
    </>,
  );
  expect(await screen.findByText("Old page")).toBeVisible();
  expect(await screen.findByText("Record detail")).toBeVisible();
  await client.prefetchQuery({ queryKey: inactiveKey, queryFn: inactive, staleTime: Infinity });

  await act(async () => {
    await client.invalidateQueries({ queryKey: ["examples", "list"] });
  });
  expect(await screen.findByText("Updated page")).toBeVisible();
  expect(active).toHaveBeenCalledTimes(2);
  expect(client.getQueryState(inactiveKey)?.isInvalidated).toBe(true);
  expect(inactive).toHaveBeenCalledTimes(1);
  expect(client.getQueryState(recordKey)?.isInvalidated).toBe(false);
  expect(detail).toHaveBeenCalledTimes(1);
});

it("matches only the requested key for exact invalidation", async () => {
  const { client } = renderQueries(null);
  const nestedKey = [...recordKey, "history"];
  const siblingKey = ["examples", "detail", "second"];
  client.setQueryData(recordKey, "Selected record");
  client.setQueryData(nestedKey, "Selected record history");
  client.setQueryData(siblingKey, "Sibling record");

  await client.invalidateQueries({ queryKey: recordKey, exact: true });
  expect(client.getQueryState(recordKey)?.isInvalidated).toBe(true);
  expect(client.getQueryState(nestedKey)?.isInvalidated).toBe(false);
  expect(client.getQueryState(siblingKey)?.isInvalidated).toBe(false);
});

it.each([
  { status: 503, code: "upstream_unavailable", showsCachedRecord: true },
  { status: 403, code: "forbidden", showsCachedRecord: false },
])(
  "applies the resource's cached-data policy after a $status refresh error",
  async ({ status, code, showsCachedRecord }) => {
    mockFetch()
      .mockResolvedValueOnce(Response.json({ data: "Protected record" }))
      .mockResolvedValueOnce(Response.json({ error: code }, { status }));
    const { client } = renderQueries(
      <QueryView
        queryKey={recordKey}
        queryFn={({ signal }) => api<string>("admin/examples/first", { signal })}
      />,
    );
    expect(await screen.findByText("Protected record")).toBeVisible();

    await act(async () => {
      await client.invalidateQueries({ queryKey: recordKey, exact: true });
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(code);
    expect(client.getQueryData(recordKey)).toBe("Protected record");
    const record = screen.queryByText("Protected record");
    if (showsCachedRecord) expect(record).toBeVisible();
    else expect(record).toBeNull();
  },
);
