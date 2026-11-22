import {
  onlineManager,
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { renderToString } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";

import { AdminI18nProvider, useAdminI18n } from "@/components/admin-i18n-provider";
import { AdminQueryProvider, useIsAdminQueryScopeCurrent } from "@/components/admin-query-provider";
import { AdminShell } from "@/components/admin-shell";
import { ToastProvider, useToast } from "@/components/toast-provider";
import { ADMIN_SESSION_CHANGED_EVENT, api } from "@/lib/client-api";

const route = vi.hoisted(() => ({ pathname: "/users", search: "" }));
vi.mock("next/navigation", () => ({
  usePathname: () => route.pathname,
  useSearchParams: () => new URLSearchParams(route.search),
  useRouter: () => ({ refresh: vi.fn() }),
}));

const fixtureKey = ["test-resource", "detail", "sample"] as const;
const user = { name: "Test admin", email: null, login_phone_number: null };

function shell(binding: string, children: ReactNode) {
  return (
    <AdminI18nProvider initialLocale="en">
      <ToastProvider>
        <AdminShell key={binding} sessionBinding={binding} user={user}>
          {children}
        </AdminShell>
      </ToastProvider>
    </AdminI18nProvider>
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}

function emitSessionChanged(binding: string) {
  window.dispatchEvent(new CustomEvent(ADMIN_SESSION_CHANGED_EVENT, { detail: binding }));
}

afterEach(async () => {
  cleanup();
  await Promise.resolve();
  delete document.documentElement.dataset.adminPageSession;
  document.cookie = "nfv_admin_locale=; Max-Age=0; Path=/";
  route.pathname = "/users";
  route.search = "";
  onlineManager.setOnline(true);
  vi.unstubAllGlobals();
});

it("retains one client and its data across route, query-string and locale changes in StrictMode", async () => {
  let client!: QueryClient;
  let isCurrent!: () => boolean;
  function RouteContent({ label }: { label: string }) {
    client = useQueryClient();
    isCurrent = useIsAdminQueryScopeCurrent();
    const { locale, setLocale } = useAdminI18n();
    return (
      <button onClick={() => setLocale("vi")}>
        {label} {locale}
      </button>
    );
  }
  const scene = (label: string) => (
    <StrictMode>{shell("session-a", <RouteContent key={label} label={label} />)}</StrictMode>
  );
  const view = render(scene("List"));
  await act(async () => {});
  const first = client;
  first.setQueryData(fixtureKey, "cached");
  expect(isCurrent()).toBe(true);

  route.pathname = "/users/example";
  view.rerender(scene("Detail"));
  route.search = "page=2";
  view.rerender(scene("Detail"));
  fireEvent.click(screen.getByRole("button", { name: "Detail en" }));
  expect(screen.getByRole("button", { name: "Detail vi" })).toBeVisible();
  expect(client).toBe(first);
  expect(client.getQueryData(fixtureKey)).toBe("cached");
  expect(isCurrent()).toBe(true);
  view.unmount();
  expect(isCurrent()).toBe(false);
  await waitFor(() => expect(first.getQueryCache().getAll()).toEqual([]));
});

it("delivers the provider through portals and starts independent server renders with a fresh client", () => {
  const clients: QueryClient[] = [];
  function Probe() {
    clients.push(useQueryClient());
    return <p>Query consumer</p>;
  }
  renderToString(
    <AdminQueryProvider>
      <Probe />
    </AdminQueryProvider>,
  );
  renderToString(
    <AdminQueryProvider>
      <Probe />
    </AdminQueryProvider>,
  );
  expect(clients[0]).not.toBe(clients[1]);

  render(shell("session-a", createPortal(<Probe />, document.body)));
  expect(screen.getByText("Query consumer")).toBeVisible();
  expect(clients.at(-1)?.getQueryCache().getAll()).toEqual([]);
});

it("retires the matching scope on session change, aborts reads and blocks a replacement login in the old document", async () => {
  const oldRead = deferred<string>();
  let signal!: AbortSignal;
  let client!: QueryClient;
  let isCurrent!: () => boolean;
  const queryFn = vi.fn(({ signal: activeSignal }: { signal: AbortSignal }) => {
    signal = activeSignal;
    return oldRead.promise;
  });
  function Probe() {
    client = useQueryClient();
    isCurrent = useIsAdminQueryScopeCurrent();
    useQuery({ queryKey: fixtureKey, queryFn });
    return <p>Protected query content</p>;
  }
  const view = render(shell("session-a", <Probe />));
  const oldClient = client;
  const oldIsCurrent = isCurrent;
  await waitFor(() => expect(queryFn).toHaveBeenCalledOnce());
  const oldQuery = oldClient.getQueryCache().find({ queryKey: fixtureKey });
  const clearCache = oldClient.clear.bind(oldClient);
  const clear = vi.spyOn(oldClient, "clear").mockImplementation(() => {
    expect(oldQuery?.getObserversCount()).toBe(0);
    clearCache();
  });
  act(() => emitSessionChanged("another-session"));
  expect(oldIsCurrent()).toBe(true);
  expect(signal.aborted).toBe(false);
  act(() => {
    emitSessionChanged("session-a");
    expect(oldIsCurrent()).toBe(false);
    expect(signal.aborted).toBe(true);
    expect(screen.queryByText("Protected query content")).not.toBeInTheDocument();
  });
  expect(clear).toHaveBeenCalledOnce();
  expect(screen.getByRole("alert")).toHaveTextContent("The admin session changed");

  view.rerender(shell("session-b", <Probe />));
  expect(screen.queryByText("Protected query content")).not.toBeInTheDocument();
  expect(queryFn).toHaveBeenCalledOnce();
  expect(document.documentElement.dataset.adminPageSession).toBe("session-a");

  view.unmount();
  delete document.documentElement.dataset.adminPageSession;
  function NewScope() {
    client = useQueryClient();
    return <p>New login content</p>;
  }
  render(shell("session-b", <NewScope />));
  const newClient = client;
  expect(newClient).not.toBe(oldClient);
  expect(newClient.getQueryData(fixtureKey)).toBeUndefined();
  await act(async () => oldRead.resolve("old response"));
  expect(oldClient.getQueryCache().getAll()).toEqual([]);
  expect(newClient.getQueryCache().getAll()).toEqual([]);
  expect(queryFn).toHaveBeenCalledOnce();
});

it("clears the protected scope on an observed 401 even when the caller declines redirect", async () => {
  let client!: QueryClient;
  let isCurrent!: () => boolean;
  function Probe() {
    client = useQueryClient();
    isCurrent = useIsAdminQueryScopeCurrent();
    return <p>Protected API content</p>;
  }
  render(shell("session-a", <Probe />));
  client.setQueryData(fixtureKey, "cached");
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ error: "resource_conflict" }, { status: 409 }))
    .mockResolvedValueOnce(Response.json({ error: "unauthorized" }, { status: 401 }));
  vi.stubGlobal("fetch", fetcher);

  await act(async () => {
    await expect(api("admin/test-resource")).rejects.toMatchObject({
      message: "resource_conflict",
      status: 409,
    });
  });
  expect(isCurrent()).toBe(true);
  expect(client.getQueryData(fixtureKey)).toBe("cached");

  const shouldRedirectToLogin = vi.fn(() => {
    expect(isCurrent()).toBe(true);
    return false;
  });
  await act(async () => {
    await expect(api("admin/test-resource", undefined, { shouldRedirectToLogin })).rejects.toThrow(
      "session_expired",
    );
  });
  expect(shouldRedirectToLogin).toHaveBeenCalledOnce();
  expect(isCurrent()).toBe(false);
  expect(client.getQueryCache().getAll()).toEqual([]);
  expect(screen.queryByText("Protected API content")).not.toBeInTheDocument();
});

it("clears both caches on invalidation while an already-dispatched mutation settles without side effects", async () => {
  const transfer = deferred<string>();
  const mutationFn = vi.fn(() => transfer.promise);
  const applied = vi.fn();
  const perCall = vi.fn();
  let client!: QueryClient;
  let completion!: Promise<string>;
  function Edit() {
    client = useQueryClient();
    const isCurrent = useIsAdminQueryScopeCurrent();
    const toast = useToast();
    const mutation = useMutation({
      mutationFn,
      onSuccess(data) {
        if (!isCurrent()) return;
        applied();
        client.setQueryData(fixtureKey, data);
        toast("Obsolete toast");
        void client.invalidateQueries({ queryKey: ["test-resource"] });
      },
    });
    return (
      <button
        onClick={() => {
          completion = mutation.mutateAsync(undefined, { onSuccess: perCall });
        }}
      >
        Save test record
      </button>
    );
  }
  const view = render(shell("session-a", <Edit />));
  client.setQueryData(fixtureKey, "cached");
  fireEvent.click(screen.getByRole("button", { name: "Save test record" }));
  await waitFor(() => expect(mutationFn).toHaveBeenCalledOnce());
  expect(client.getMutationCache().getAll()).toHaveLength(1);
  act(() => emitSessionChanged("session-a"));
  expect(client.getMutationCache().getAll()).toEqual([]);
  expect(client.getQueryCache().getAll()).toEqual([]);
  view.unmount();
  delete document.documentElement.dataset.adminPageSession;
  let newClient!: QueryClient;
  function NewScope() {
    newClient = useQueryClient();
    return null;
  }
  render(shell("session-b", <NewScope />));
  newClient.setQueryData(fixtureKey, "new session");
  await act(async () => {
    transfer.resolve("saved on the server");
    await expect(completion).resolves.toBe("saved on the server");
  });
  expect(mutationFn).toHaveBeenCalledOnce();
  expect(applied).not.toHaveBeenCalled();
  expect(perCall).not.toHaveBeenCalled();
  expect(screen.queryByText("Obsolete toast")).not.toBeInTheDocument();
  expect(client.getQueryCache().getAll()).toEqual([]);
  expect(client.getMutationCache().getAll()).toEqual([]);
  expect(newClient.getQueryData(fixtureKey)).toBe("new session");
});

it("lets the owning scope block a prepared mutation that has not dispatched yet", async () => {
  const prepared = deferred<void>();
  const prepare = vi.fn(() => prepared.promise);
  const send = vi.fn();
  let completion!: Promise<unknown>;
  function Edit() {
    const isCurrent = useIsAdminQueryScopeCurrent();
    const mutation = useMutation({
      onMutate: prepare,
      mutationFn: async () => {
        if (!isCurrent()) throw new DOMException("Admin scope ended", "AbortError");
        send();
      },
    });
    return (
      <button
        onClick={() => {
          completion = mutation.mutateAsync();
        }}
      >
        Prepare test write
      </button>
    );
  }
  render(shell("session-a", <Edit />));
  fireEvent.click(screen.getByRole("button", { name: "Prepare test write" }));
  await waitFor(() => expect(prepare).toHaveBeenCalledOnce());
  act(() => emitSessionChanged("session-a"));
  await act(async () => {
    prepared.resolve();
    await expect(completion).rejects.toMatchObject({ name: "AbortError" });
  });
  expect(send).not.toHaveBeenCalled();
});

it("fails a mutation once while offline and never replays it on reconnect", async () => {
  onlineManager.setOnline(false);
  const fetcher = vi.fn().mockRejectedValue(new TypeError("offline"));
  vi.stubGlobal("fetch", fetcher);
  let client!: QueryClient;
  function Edit() {
    client = useQueryClient();
    const mutation = useMutation({
      mutationFn: () => api("admin/test-resource", { method: "POST", body: "{}" }),
    });
    return (
      <>
        <button onClick={() => mutation.mutate()}>Submit test</button>
        <p>{mutation.error?.message}</p>
      </>
    );
  }
  render(shell("session-a", <Edit />));
  expect(client.getDefaultOptions().mutations).toMatchObject({
    retry: false,
    networkMode: "always",
  });
  fireEvent.click(screen.getByRole("button", { name: "Submit test" }));
  expect(await screen.findByText("network_error")).toBeVisible();
  await act(async () => onlineManager.setOnline(true));
  expect(fetcher).toHaveBeenCalledOnce();
});

it("removes protected content and clears client state before a document is cached in browser history", () => {
  let client!: QueryClient;
  let isCurrent!: () => boolean;
  function Probe() {
    client = useQueryClient();
    isCurrent = useIsAdminQueryScopeCurrent();
    return <p>Protected snapshot content</p>;
  }
  render(shell("session-a", <Probe />));
  client.setQueryData(fixtureKey, "cached");
  act(() => window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true })));
  expect(screen.queryByText("Protected snapshot content")).not.toBeInTheDocument();
  expect(isCurrent()).toBe(false);
  expect(client.getQueryCache().getAll()).toEqual([]);
});
