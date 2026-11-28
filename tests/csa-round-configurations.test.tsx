import {
  act,
  cleanup,
  fireEvent,
  render as renderView,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  AdminBreadcrumbProvider,
  useAdminBreadcrumbs,
} from "@/components/admin-breadcrumb-context";
import { AdminHeaderContent } from "@/components/admin-header";
import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { AdminQueryProvider } from "@/components/admin-query-provider";
import { CSAOccurrenceList } from "@/components/csa-occurrence-list";
import { CSARoundDetail } from "@/components/csa-round-detail";
import { CSARoundEditor } from "@/components/csa-round-editor";
import { CSARoundList } from "@/components/csa-round-list";
import { ToastProvider } from "@/components/toast-provider";
import { api, apiEnvelope } from "@/lib/client-api";
import CSARoundRouteLoading from "@/app/(admin)/csa-rounds/loading";
import {
  readRoundNavigationContext,
  roundRecordHref,
} from "@/app/(admin)/csa-rounds/round-navigation";
import { deferred } from "@/tests/deferred";

vi.mock("@/lib/client-api", () => ({ api: vi.fn(), apiEnvelope: vi.fn() }));
const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", async () => {
  const { useMemo, useSyncExternalStore } = await import("react");
  const subscribe = (notify: () => void) => {
    window.addEventListener("popstate", notify);
    return () => window.removeEventListener("popstate", notify);
  };
  return {
    usePathname: () => useSyncExternalStore(subscribe, () => window.location.pathname),
    useRouter: () => ({ push: vi.fn(), replace }),
    useSearchParams: () => {
      const search = useSyncExternalStore(subscribe, () => window.location.search);
      return useMemo(() => new URLSearchParams(search), [search]);
    },
  };
});

beforeEach(() => {
  for (const method of ["pushState", "replaceState"] as const) {
    const change = window.history[method].bind(window.history);
    vi.spyOn(window.history, method).mockImplementation(
      (data, unused, url?: string | URL | null) => {
        change(data, unused, url);
        window.dispatchEvent(new PopStateEvent("popstate"));
      },
    );
  }
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

const rootId = "24803641-2dce-4cac-8fc4-91e55f03e95f";
const childId = "7b4950c1-940f-4279-b0c2-f56b17d9ff0c";
const soloId = "829ffdf2-2314-455e-9f74-dd09a6d2e8ae";
const groupedPath = `/csa-rounds/configurations/${rootId}`;
const dateTime = "2026-11-20T08:00:00+07:00";
const configuration = {
  version: 1,
  id: rootId,
  name: "Friday harvest",
  opens_at: dateTime,
  closes_at: "2026-11-21T18:00:00+07:00",
  delivery_date: "2026-11-22",
  status: "published",
  type: "weekly",
  created_at: dateTime,
  published_at: dateTime,
  recurrence_mode: "draft",
};
const standalone = {
  ...configuration,
  id: soloId,
  name: "Solo harvest",
  type: "standalone",
  recurrence_mode: null,
};
const occurrence = {
  ...configuration,
  id: childId,
  configuration_id: rootId,
  configuration_name: configuration.name,
  name: "Renamed week",
  opens_at: "2026-11-26T18:00:00Z",
  closes_at: "2026-11-28T18:00:00+07:00",
  delivery_date: "2026-11-29",
  participant_count: 7,
  status: "scheduled",
  can_edit: true,
  server_time: dateTime,
  recurrence: null,
};

function Header() {
  return <AdminHeaderContent items={useAdminBreadcrumbs([])} />;
}

function render(view: ReactElement) {
  return renderView(view, { wrapper: AdminQueryProvider });
}

it("uses the configuration name and screen title on a direct round link", async () => {
  const pathname = `/csa-rounds/${childId}`;
  window.history.replaceState(null, "", pathname);
  vi.mocked(api).mockImplementation(async (endpoint) => {
    if (endpoint === `admin/csa-rounds/${childId}`) return occurrence;
    throw new Error("request_failed");
  });
  vi.mocked(apiEnvelope).mockResolvedValue({
    data: [],
    demand: [],
    meta: { page: 1, page_size: 20, total: 0 },
  } as never);
  render(
    <AdminI18nProvider initialLocale="vi">
      <AdminBreadcrumbProvider pathname={pathname}>
        <Header />
        <CSARoundDetail roundId={childId} />
      </AdminBreadcrumbProvider>
    </AdminI18nProvider>,
  );

  const header = within(screen.getByRole("navigation", { name: "Đường dẫn điều hướng" }));
  expect(await header.findByRole("link", { name: configuration.name })).toHaveAttribute(
    "href",
    groupedPath,
  );
  expect(header.getByText("Chi tiết đợt CSA")).toHaveAttribute("aria-current", "page");
  expect(header.queryByText(/27\/11\/2026/)).not.toBeInTheDocument();
  expect(
    vi
      .mocked(api)
      .mock.calls.some(([endpoint]) => endpoint.startsWith("admin/csa-round-configurations/")),
  ).toBe(false);
});

it.each([false, true])(
  "keeps the screen trail and filters in round detail and edit (%s)",
  async (editing) => {
    const query =
      "?status=published&page=2&type=weekly&occurrenceStatus=scheduled&occurrencePage=3&occurrenceSearch=Renamed";
    const search = query.replace(
      "&occurrenceStatus",
      `&configurationId=${rootId}&occurrenceStatus`,
    );
    const path = `/csa-rounds/${childId}`;
    const pathname = editing ? `${path}/edit` : path;
    const context = readRoundNavigationContext(new URLSearchParams(search));
    const label = "CSA round details";
    window.history.replaceState(null, "", pathname + search);
    vi.mocked(api).mockImplementation(async (endpoint) => {
      if (endpoint === `admin/csa-rounds/${childId}`) return occurrence;
      throw new Error(endpoint);
    });
    vi.mocked(apiEnvelope).mockResolvedValue({
      data: [],
      demand: [],
      meta: { page: 1, page_size: 20, total: 0 },
    } as never);
    render(
      <AdminI18nProvider initialLocale="en">
        <AdminBreadcrumbProvider pathname={pathname} search={search}>
          <Header />
          {editing ? (
            <CSARoundEditor roundId={childId} listContext={context} />
          ) : (
            <CSARoundDetail roundId={childId} listContext={context} />
          )}
        </AdminBreadcrumbProvider>
      </AdminI18nProvider>,
    );

    const header = within(screen.getByRole("navigation", { name: "Breadcrumbs" }));
    expect(await header.findByRole("link", { name: configuration.name })).toHaveAttribute(
      "href",
      groupedPath + query,
    );
    expect(header.getByRole("link", { name: "CSA round configurations" })).toHaveAttribute(
      "href",
      "/csa-rounds?status=published&page=2&type=weekly",
    );
    if (editing) {
      expect(header.getByRole("link", { name: label })).toHaveAttribute("href", path + search);
      expect(header.getByText("Edit round")).toHaveAttribute("aria-current", "page");
    } else {
      expect(header.getByText(label)).toHaveAttribute("aria-current", "page");
      expect(screen.getByRole("link", { name: "Edit round" })).toHaveAttribute(
        "href",
        pathname + "/edit" + search,
      );
    }
  },
);

it("keeps the configuration in the header throughout navigation to a round and back", async () => {
  const detailHref = roundRecordHref(childId, {}, rootId);
  const loadConfiguration = vi.fn().mockResolvedValueOnce(configuration);
  loadConfiguration.mockImplementation(() => new Promise(() => {}));
  let resolveRound!: (round: typeof occurrence) => void;
  const roundRead = new Promise<typeof occurrence>((resolve) => {
    resolveRound = resolve;
  });
  vi.mocked(api).mockImplementation(async (endpoint) => {
    if (endpoint === `admin/csa-round-configurations/${rootId}`) return loadConfiguration();
    if (endpoint === `admin/csa-rounds/${childId}`) return roundRead;
    throw new Error(endpoint);
  });
  vi.mocked(apiEnvelope).mockImplementation(async (endpoint) => ({
    data: endpoint.startsWith("admin/csa-round-configurations/") ? [occurrence] : [],
    demand: [],
    meta: { page: 1, page_size: 20, total: 1 },
  }));
  function view(href: string, loading = false) {
    const { pathname, searchParams } = new URL(href, window.location.origin);
    const context = readRoundNavigationContext(searchParams);
    return (
      <AdminI18nProvider initialLocale="en">
        <ToastProvider>
          <AdminBreadcrumbProvider pathname={pathname} search={searchParams.toString()}>
            <Header />
            {loading ? (
              <CSARoundRouteLoading />
            ) : pathname === groupedPath ? (
              <CSAOccurrenceList configurationId={rootId} />
            ) : (
              <CSARoundDetail roundId={childId} listContext={context} />
            )}
          </AdminBreadcrumbProvider>
        </ToastProvider>
      </AdminI18nProvider>
    );
  }

  window.history.replaceState(null, "", groupedPath);
  const { rerender } = render(view(groupedPath));
  const header = () => within(screen.getByRole("navigation", { name: "Breadcrumbs" }));
  await screen.findByRole("navigation", { name: "Breadcrumbs" });
  expect(await header().findByText(configuration.name)).toHaveAttribute("aria-current", "page");
  expect(await screen.findByRole("link", { name: /Renamed week/ })).toHaveAttribute(
    "href",
    detailHref,
  );

  act(() => {
    window.history.replaceState(null, "", detailHref);
    rerender(view(detailHref, true));
  });
  expect(header().getByRole("link", { name: configuration.name })).toHaveAttribute(
    "href",
    groupedPath,
  );
  expect(header().getByText("CSA round details")).toHaveAttribute("aria-current", "page");

  rerender(view(detailHref));
  expect(header().getByRole("link", { name: configuration.name })).toHaveAttribute(
    "href",
    groupedPath,
  );
  expect(header().getByText("CSA round details")).toHaveAttribute("aria-current", "page");
  expect(api).toHaveBeenCalledWith(`admin/csa-rounds/${childId}`, expect.anything());
  await act(async () => resolveRound(occurrence));

  act(() => {
    window.history.replaceState(null, "", groupedPath);
    rerender(view(groupedPath));
  });
  expect(header().getByText(configuration.name)).toHaveAttribute("aria-current", "page");
  expect(header().queryByText("CSA round details")).not.toBeInTheDocument();
  await waitFor(() => expect(loadConfiguration).toHaveBeenCalledTimes(2));
});

it("keeps the parent title while returning from a directly opened round", async () => {
  const detailPath = `/csa-rounds/${childId}`;
  window.history.replaceState(null, "", detailPath);
  let resolveConfiguration!: (result: typeof configuration) => void;
  const configurationRead = new Promise<typeof configuration>((resolve) => {
    resolveConfiguration = resolve;
  });
  vi.mocked(api).mockImplementation(async (endpoint) => {
    if (endpoint === `admin/csa-rounds/${childId}`) return occurrence;
    if (endpoint === `admin/csa-round-configurations/${rootId}`) return configurationRead;
    throw new Error(endpoint);
  });
  vi.mocked(apiEnvelope).mockImplementation(async () => ({
    data: [],
    demand: [],
    meta: { page: 1, page_size: 20, total: 0 },
  }));
  function view(pathname: string, content: ReactElement) {
    return (
      <AdminI18nProvider initialLocale="en">
        <ToastProvider>
          <AdminBreadcrumbProvider pathname={pathname}>
            <Header />
            {content}
          </AdminBreadcrumbProvider>
        </ToastProvider>
      </AdminI18nProvider>
    );
  }

  const { rerender } = render(view(detailPath, <CSARoundDetail roundId={childId} />));
  const parent = await screen.findByRole("link", { name: configuration.name });
  expect(parent).toHaveAttribute("href", groupedPath);
  const header = () => within(screen.getByRole("navigation", { name: "Breadcrumbs" }));

  act(() => {
    window.history.replaceState(null, "", groupedPath);
    rerender(view(groupedPath, <CSARoundRouteLoading />));
  });
  expect(header().getByText(configuration.name)).toHaveAttribute("aria-current", "page");

  rerender(view(groupedPath, <CSAOccurrenceList configurationId={rootId} />));
  expect(header().getByText(configuration.name)).toHaveAttribute("aria-current", "page");
  await act(async () => resolveConfiguration({ ...configuration, name: "Updated harvest" }));
  expect(await header().findByText("Updated harvest")).toHaveAttribute("aria-current", "page");
});

it("opens both types as configuration details", async () => {
  window.history.replaceState(null, "", "/csa-rounds?status=published&page=2");
  vi.mocked(apiEnvelope).mockResolvedValue({
    data: [configuration, standalone],
    meta: { page: 2, page_size: 20, total: 22 },
  });
  render(
    <AdminI18nProvider initialLocale="en">
      <CSARoundList />
    </AdminI18nProvider>,
  );

  expect(await screen.findByRole("link", { name: "Friday harvest" })).toHaveAttribute(
    "href",
    `${groupedPath}?status=published&page=2`,
  );
  expect(screen.getByRole("link", { name: "Solo harvest" })).toHaveAttribute(
    "href",
    `/csa-rounds/configurations/${soloId}?status=published&page=2`,
  );
  expect(screen.getByRole("link", { name: "Create configuration" })).toHaveAttribute(
    "href",
    "/csa-rounds/new?status=published&page=2",
  );
  expect(apiEnvelope).toHaveBeenCalledWith(
    "admin/csa-round-configurations?page=2&page_size=20&status=published",
    { signal: expect.any(AbortSignal) },
  );
});

it("shows only the four configuration columns and independent configuration states", async () => {
  window.history.replaceState(null, "", "/csa-rounds");
  vi.mocked(apiEnvelope).mockResolvedValue({
    data: [
      configuration,
      { ...standalone, status: "draft" },
      { ...configuration, id: childId, name: "Stopped", status: "cancelled" },
    ],
    meta: { page: 1, page_size: 20, total: 3 },
  });
  render(
    <AdminI18nProvider initialLocale="vi">
      <CSARoundList />
    </AdminI18nProvider>,
  );
  const table = within(await screen.findByRole("table"));
  expect(table.getAllByRole("columnheader").map((heading) => heading.textContent)).toEqual([
    "Tên cấu hình",
    "Loại cấu hình",
    "Trạng thái cấu hình",
    "Ngày tạo",
  ]);
  const published = within(table.getByRole("row", { name: /Friday harvest/ }));
  expect(published.getByRole("cell", { name: "Lặp hằng tuần" })).toBeVisible();
  expect(published.getByRole("cell", { name: "Đã công bố" })).toBeVisible();
  expect(published.getByText("20/11/2026")).toHaveAttribute("datetime", dateTime);
  expect(table.getByRole("row", { name: /Solo harvest Một lần Nháp/ })).toBeVisible();
  expect(table.getByRole("row", { name: /Stopped Lặp hằng tuần Đã hủy/ })).toBeVisible();
});

it("retains occurrences and navigation context when stopping a weekly schedule", async () => {
  const search = "?status=published&page=2&type=weekly&occurrenceStatus=scheduled&occurrencePage=2";
  window.history.replaceState(null, "", `${groupedPath}${search}`);
  vi.mocked(api).mockImplementation(async (endpoint) => {
    if (endpoint.endsWith("/stop")) {
      return {
        ...configuration,
        status: "cancelled",
      };
    }
    return configuration;
  });
  vi.mocked(apiEnvelope).mockResolvedValue({
    data: [occurrence],
    meta: { page: 2, page_size: 20, total: 21 },
  });
  render(
    <AdminI18nProvider initialLocale="en">
      <ToastProvider>
        <AdminBreadcrumbProvider pathname={groupedPath} search={search}>
          <Header />
          <CSAOccurrenceList configurationId={rootId} />
        </AdminBreadcrumbProvider>
      </ToastProvider>
    </AdminI18nProvider>,
  );

  const table = await screen.findByRole("table");
  const header = within(screen.getByRole("navigation", { name: "Breadcrumbs" }));
  expect(header.getByText(configuration.name)).toHaveAttribute("aria-current", "page");
  expect(screen.getByText("20/11/2026 08:00")).toBeVisible();
  expect(screen.getByText("21/11/2026 18:00")).toBeVisible();
  expect(screen.getByText("22/11/2026")).toBeVisible();
  expect(screen.getByText("Create a draft for me to publish")).toBeVisible();
  expect(screen.queryByText("26/11/2026 08:00")).not.toBeInTheDocument();
  const roundTitle = "27/11/2026 01:00 → 28/11/2026 18:00 Renamed week";
  const detail = within(table).getByRole("link", { name: roundTitle });
  const row = within(table).getByRole("row", { name: /Renamed week/ });
  expect(within(detail).getByText("27/11/2026 01:00")).toHaveAttribute(
    "datetime",
    occurrence.opens_at,
  );
  expect(within(detail).getByText("28/11/2026 18:00")).toHaveAttribute(
    "datetime",
    occurrence.closes_at,
  );
  expect(detail).toHaveAttribute(
    "href",
    `/csa-rounds/${childId}?status=published&page=2&type=weekly&configurationId=${rootId}&occurrenceStatus=scheduled&occurrencePage=2`,
  );
  expect(within(row).getByText("7")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "CSA round configurations" })).toHaveAttribute(
    "href",
    "/csa-rounds?status=published&page=2&type=weekly",
  );
  expect(apiEnvelope).toHaveBeenCalledWith(
    `admin/csa-round-configurations/${rootId}/rounds?page=2&page_size=20&status=scheduled`,
    { signal: expect.any(AbortSignal) },
  );
  expect(screen.queryByRole("button", { name: /cancel.*round/i })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Cancel recurrence" }));
  const dialog = within(screen.getByRole("dialog"));
  expect(api).toHaveBeenCalledTimes(1);
  await act(async () => fireEvent.click(dialog.getByRole("button", { name: "Cancel recurrence" })));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(api).toHaveBeenLastCalledWith(
    `admin/csa-round-configurations/${rootId}/stop`,
    {
      method: "POST",
      body: JSON.stringify({ version: 1 }),
    },
    { shouldRedirectToLogin: expect.any(Function) },
  );
  expect(screen.getByRole("link", { name: roundTitle })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Cancel recurrence" })).not.toBeInTheDocument();
});

it.each([configuration, standalone])(
  "publishes a $type draft in place and only then loads its rounds",
  async (config) => {
    const path = `/csa-rounds/configurations/${config.id}`;
    window.history.replaceState(null, "", path);
    vi.mocked(api).mockImplementation(async (endpoint) =>
      endpoint.endsWith("/publish") ? config : { ...config, status: "draft", published_at: null },
    );
    vi.mocked(apiEnvelope).mockResolvedValue({
      data: [occurrence],
      meta: { page: 1, page_size: 20, total: 1 },
    });
    render(
      <AdminI18nProvider initialLocale="en">
        <ToastProvider>
          <CSAOccurrenceList configurationId={config.id} />
        </ToastProvider>
      </AdminI18nProvider>,
    );
    const publish = await screen.findByRole("button", { name: "Publish" });
    expect(screen.getByRole("link", { name: "Edit configuration" })).toHaveAttribute(
      "href",
      path + "/edit",
    );
    expect(screen.getByRole("button", { name: "Delete draft" })).toBeVisible();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(apiEnvelope).not.toHaveBeenCalled();
    fireEvent.click(publish);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Publish" }));
    expect(await screen.findByRole("table")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Delete draft" })).not.toBeInTheDocument();
    expect(window.location.pathname).toBe(path);
    expect(Boolean(screen.queryByRole("button", { name: "Cancel recurrence" }))).toBe(
      config.type === "weekly",
    );
  },
);

it("confirms draft deletion and returns to the filtered configuration list", async () => {
  window.history.replaceState(null, "", groupedPath + "?status=draft&type=weekly");
  vi.mocked(api).mockResolvedValue({ ...configuration, status: "draft", published_at: null });
  render(
    <AdminI18nProvider initialLocale="en">
      <ToastProvider>
        <CSAOccurrenceList configurationId={rootId} />
      </ToastProvider>
    </AdminI18nProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Delete draft" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete draft" }));
  await waitFor(() => expect(replace).toHaveBeenCalledWith("/csa-rounds?status=draft&type=weekly"));
  expect(api).toHaveBeenCalledWith(
    `admin/csa-round-configurations/${rootId}`,
    { method: "DELETE", body: JSON.stringify({ version: 1 }) },
    { response: "no-content", shouldRedirectToLogin: expect.any(Function) },
  );
  expect(apiEnvelope).not.toHaveBeenCalled();
});

it.each([
  ["Publish", "POST", "publish", "draft"],
  ["Delete draft", "DELETE", "", "draft"],
  ["Cancel recurrence", "POST", "stop", "published"],
] as const)(
  "limits the %s session redirect to the submitting route",
  async (label, method, action, status) => {
    window.history.replaceState(null, "", groupedPath);
    const write = deferred<unknown>();
    vi.mocked(api).mockImplementation(async (_path, init) =>
      init?.method === method
        ? write.promise
        : { ...configuration, status, published_at: status === "draft" ? null : dateTime },
    );
    vi.mocked(apiEnvelope).mockResolvedValue({
      data: [],
      meta: { page: 1, page_size: 20, total: 0 },
    });
    const view = render(
      <AdminI18nProvider initialLocale="en">
        <ToastProvider>
          <CSAOccurrenceList configurationId={rootId} />
        </ToastProvider>
      </AdminI18nProvider>,
    );
    const button = await screen.findByRole("button", { name: label });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: label }));
    const path = `admin/csa-round-configurations/${rootId}${action ? `/${action}` : ""}`;
    const actionCall = vi
      .mocked(api)
      .mock.calls.find(([endpoint, init]) => endpoint === path && init?.method === method);
    expect(actionCall?.[2]?.shouldRedirectToLogin?.()).toBe(true);
    view.rerender(<div>Different route</div>);
    expect(actionCall?.[2]?.shouldRedirectToLogin?.()).toBe(false);
    await act(async () =>
      write.reject(Object.assign(new Error("session_expired"), { status: 401 })),
    );
    expect(replace).not.toHaveBeenCalled();
  },
);

it("shows published rounds when deleting a stale draft conflicts with publication", async () => {
  window.history.replaceState(null, "", groupedPath);
  let current = { ...configuration, status: "draft", published_at: null as string | null };
  vi.mocked(api).mockImplementation(async (endpoint, options) => {
    if (endpoint !== `admin/csa-round-configurations/${rootId}`) throw new Error(endpoint);
    if (options?.method === "DELETE") {
      throw Object.assign(new Error("csa_configuration_not_draft"), { status: 409 });
    }
    return current;
  });
  vi.mocked(apiEnvelope).mockResolvedValue({
    data: [occurrence],
    meta: { page: 1, page_size: 20, total: 1 },
  });
  render(
    <AdminI18nProvider initialLocale="en">
      <ToastProvider>
        <CSAOccurrenceList configurationId={rootId} />
      </ToastProvider>
    </AdminI18nProvider>,
  );
  const deleteDraft = await screen.findByRole("button", { name: "Delete draft" });
  current = configuration;
  fireEvent.click(deleteDraft);
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete draft" }));

  expect(await screen.findByRole("link", { name: /Renamed week/ })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Delete draft" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Edit configuration" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Publish" })).not.toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("links a standalone round back to its configuration screen", async () => {
  const pathname = `/csa-rounds/${childId}`;
  window.history.replaceState(null, "", pathname);
  vi.mocked(api).mockResolvedValue({
    ...occurrence,
    configuration_id: soloId,
    configuration_name: standalone.name,
  });
  vi.mocked(apiEnvelope).mockResolvedValue({
    data: [],
    demand: [],
    meta: { page: 1, page_size: 20, total: 0 },
  } as never);
  render(
    <AdminI18nProvider initialLocale="en">
      <AdminBreadcrumbProvider pathname={pathname}>
        <Header />
        <CSARoundDetail roundId={childId} />
      </AdminBreadcrumbProvider>
    </AdminI18nProvider>,
  );
  const header = within(screen.getByRole("navigation", { name: "Breadcrumbs" }));
  expect(await header.findByRole("link", { name: standalone.name })).toHaveAttribute(
    "href",
    `/csa-rounds/configurations/${soloId}`,
  );
  expect(header.getByText("CSA round details")).toHaveAttribute("aria-current", "page");
  expect(header.getByRole("link", { name: "CSA round configurations" })).toHaveAttribute(
    "href",
    "/csa-rounds",
  );
  expect(header.queryByText(/20\/11\/2026/)).not.toBeInTheDocument();
  expect(
    vi
      .mocked(api)
      .mock.calls.some(([endpoint]) => endpoint.startsWith("admin/csa-round-configurations/")),
  ).toBe(false);
});

it("searches the configuration rounds before pagination while retaining the status filter", async () => {
  const search = "?status=draft&page=2&occurrenceStatus=scheduled&occurrencePage=2";
  window.history.replaceState(null, "", groupedPath + search);
  vi.mocked(api).mockResolvedValue(configuration);
  vi.mocked(apiEnvelope).mockImplementation(async (endpoint) => ({
    data: [occurrence],
    meta: {
      page: Number(new URLSearchParams(endpoint.split("?")[1]).get("page")),
      page_size: 20,
      total: 21,
    },
  }));
  render(
    <AdminI18nProvider initialLocale="en">
      <ToastProvider>
        <CSAOccurrenceList configurationId={rootId} />
      </ToastProvider>
    </AdminI18nProvider>,
  );
  const textbox = await screen.findByRole("searchbox", { name: "Search rounds" });
  fireEvent.change(textbox, { target: { value: "Renamed" } });
  fireEvent.submit(textbox.closest("form")!);
  await waitFor(() =>
    expect(apiEnvelope).toHaveBeenLastCalledWith(
      `admin/csa-round-configurations/${rootId}/rounds?page=1&page_size=20&status=scheduled&search=Renamed`,
      { signal: expect.any(AbortSignal) },
    ),
  );
  expect(location.search).toBe(
    "?status=draft&page=2&occurrenceStatus=scheduled&occurrenceSearch=Renamed",
  );
  expect(await screen.findByRole("link", { name: /Renamed week/ })).toHaveAttribute(
    "href",
    `/csa-rounds/${childId}?status=draft&page=2&configurationId=${rootId}&occurrenceStatus=scheduled&occurrenceSearch=Renamed`,
  );
});
