import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { NextRouter } from "next/router";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { AdminSupplyRequestDetail } from "@/components/admin-supply-request-detail";
import { AdminSupplyRequestList } from "@/components/admin-supply-request-list";
import {
  AdminBreadcrumbProvider,
  useAdminBreadcrumbs,
} from "@/components/admin-breadcrumb-context";
import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { AdminNavigationProvider } from "@/components/admin-navigation-link";
import { AdminQueryProvider } from "@/components/admin-query-provider";
import { ToastProvider } from "@/components/toast-provider";
import {
  farmAccess,
  farmDeleteSupplyWriteFilters,
  farmDetailKey,
  farmListKey,
  farmSupplyKey,
  farmSupplyRequestDetailKey,
  farmSupplyRequestListKey,
  retireFarmAccess,
} from "@/lib/farm-query";
import {
  adminSupplyRequest,
  adminSupplyRequests,
  decideSupplyRequest,
  type AdminSupplyRequest,
} from "@/lib/farm-supply-request-api";
import { listFarms } from "@/lib/farms-api";
import type { Farm } from "@/lib/types";

const router = { push: vi.fn(), replace: vi.fn(), prefetch: vi.fn().mockResolvedValue(undefined) };
const navigate = vi.fn();
let client: QueryClient;
let params = new URLSearchParams();
vi.mock("next/navigation", () => ({ useRouter: () => router, useSearchParams: () => params }));
vi.mock("@/lib/farm-supply-request-api", async (load) => ({
  ...(await load<typeof import("@/lib/farm-supply-request-api")>()),
  adminSupplyRequests: vi.fn(),
  adminSupplyRequest: vi.fn(),
  decideSupplyRequest: vi.fn(),
}));
vi.mock("@/lib/farms-api", () => ({ listFarms: vi.fn(), getFarm: vi.fn() }));

const farmId = "f3866392-a259-4628-9e4d-2620012ec33d";
const requestId = "ef7fb39f-605e-4a9d-bbde-2afcd6778241";
const productId = "0347c5db-059c-4037-844e-ccefa0457dba";
const stockBatchId = "6f40806d-dd19-4ec0-b10a-1e4214f64093";
const entry: AdminSupplyRequest = {
  id: requestId,
  code: "FSR-TEST",
  status: "pending",
  farm: { id: farmId, name_en: "Far Hill", name_vi: "Đồi Xa", is_active: true },
  start_date: "2026-12-01",
  end_date: "2026-12-09",
  submitted_at: "2026-11-27T12:00:00Z",
  processed_at: null,
  processed_by_id: null,
  rejection_reason: null,
  items: [
    {
      product_id: productId,
      sku: "VEG-500",
      name_vi: "Rau xanh",
      name_en: "Greens",
      unit_size: "0.500",
      unit_label_vi: "kg",
      unit_label_en: "kg",
      quantity_units: 3,
      source_id: "91a27149-21d5-4cea-a831-df16d51908ea",
      source_generation: 1,
      source_version: 1,
      stock_batch_id: null,
    },
  ],
};
const approval: AdminSupplyRequest = {
  ...entry,
  status: "approved",
  processed_at: "2026-11-27T12:30:00Z",
  items: entry.items.map((item) => ({ ...item, stock_batch_id: stockBatchId })),
};

const detailsPath = `/farm-supply-requests/${requestId}`;
const listPath = "/farm-supply-requests";

function CaptureClient() {
  client = useQueryClient();
  return null;
}

function Breadcrumbs() {
  const parts = useAdminBreadcrumbs([]);
  return (
    <nav aria-label="Test trail">
      {parts.map(({ label, href }) =>
        href ? (
          <a key={label} href={href}>
            {label}
          </a>
        ) : (
          <span key={label}>{label}</span>
        ),
      )}
    </nav>
  );
}

function renderPage(children: ReactNode, path = listPath) {
  return render(children, {
    wrapper: ({ children }) => (
      <AdminI18nProvider initialLocale="en">
        <AdminQueryProvider>
          <ToastProvider>
            <RouterContext.Provider value={router as unknown as NextRouter}>
              <AdminNavigationProvider value={navigate}>
                <AdminBreadcrumbProvider pathname={path} search={params.toString()}>
                  <CaptureClient />
                  <Breadcrumbs />
                  {children}
                </AdminBreadcrumbProvider>
              </AdminNavigationProvider>
            </RouterContext.Provider>
          </ToastProvider>
        </AdminQueryProvider>
      </AdminI18nProvider>
    ),
  });
}

function renderDetail(data = entry) {
  vi.mocked(adminSupplyRequest).mockResolvedValue(data);
  return renderPage(<AdminSupplyRequestDetail requestId={requestId} />, detailsPath);
}

function queryResponse(data: AdminSupplyRequest[], page = 1) {
  return { data, meta: { page, page_size: 20, total: 62 } };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

afterEach(() => {
  cleanup();
  params = new URLSearchParams();
  window.history.replaceState(null, "", "/");
  vi.resetAllMocks();
  vi.restoreAllMocks();
});

it("preserves the list context in desktop Drawer, keeps snapshot details and restores focus", async () => {
  params = new URLSearchParams("search=far&status=pending&page=2");
  vi.mocked(adminSupplyRequests).mockResolvedValue(queryResponse([entry], 2));
  vi.mocked(adminSupplyRequest).mockResolvedValue(entry);
  renderPage(<AdminSupplyRequestList />);

  const link = await screen.findByRole("link", { name: entry.code });
  expect(link).toHaveAttribute("href", `${detailsPath}?search=far&status=pending&page=2`);
  expect(adminSupplyRequest).not.toHaveBeenCalled();
  link.focus();
  fireEvent.click(link);
  const drawer = await screen.findByRole("dialog", { name: "Request details" });
  expect(within(drawer).getByRole("button", { name: "Close" })).toBeVisible();
  expect(await within(drawer).findByText("Greens")).toBeVisible();
  expect(within(drawer).getByText("1.5 kg")).toBeVisible();
  expect(within(drawer).queryByText(stockBatchId)).not.toBeInTheDocument();
  expect(screen.getByRole("navigation", { name: "Test trail" })).toBeEmptyDOMElement();
  expect(navigate).not.toHaveBeenCalled();
  fireEvent.click(within(drawer).getByRole("button", { name: "Close" }));
  await waitFor(() => expect(link).toHaveFocus());
});

it("uses the real mobile route and a filtered parent breadcrumb for the shared detail", async () => {
  vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
    matches: true,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  params = new URLSearchParams(`search=far&farm_id=${farmId}&status=pending&page=2`);
  vi.mocked(adminSupplyRequests).mockResolvedValue(queryResponse([entry], 2));
  renderPage(<AdminSupplyRequestList />);
  fireEvent.click(await screen.findByRole("link", { name: entry.code }));
  expect(navigate).toHaveBeenCalledWith(
    `${detailsPath}?search=far&farm_id=${farmId}&status=pending&page=2`,
    expect.anything(),
  );
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

  cleanup();
  renderDetail(approval);
  expect(await screen.findByText("Greens")).toBeVisible();
  expect(screen.getByRole("heading", { level: 1, name: "Request details" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Supply requests" })).toHaveAttribute(
    "href",
    `${listPath}?search=far&farm_id=${farmId}&status=pending&page=2`,
  );
  expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
});

it("keeps the current rows on refresh and submits searches at page one", async () => {
  params = new URLSearchParams("search=far&page=2");
  window.history.replaceState(null, "", `${listPath}?search=far&page=2`);
  const refresh = deferred<ReturnType<typeof queryResponse>>();
  vi.mocked(adminSupplyRequests)
    .mockResolvedValueOnce(queryResponse([entry], 2))
    .mockReturnValueOnce(refresh.promise);
  renderPage(<AdminSupplyRequestList />);
  expect(await screen.findByRole("link", { name: entry.code })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Refresh supply requests" }));
  expect(screen.getByRole("link", { name: entry.code })).toBeVisible();
  await act(async () => refresh.resolve(queryResponse([entry], 2)));
  const search = screen.getByRole("searchbox", { name: "Find by request code or farm name" });
  fireEvent.change(search, { target: { value: "other" } });
  expect(adminSupplyRequests).toHaveBeenCalledTimes(2);
  fireEvent.submit(search.closest("form")!);
  expect(window.location.search).toBe("?search=other");
});

it("loads inactive Farms independently of the supply request page and applies a Farm filter", async () => {
  window.history.replaceState(null, "", listPath);
  vi.mocked(adminSupplyRequests).mockResolvedValue(queryResponse([entry]));
  const inactive = {
    ...entry.farm,
    id: "89dc19b8-013f-495d-963f-04c73de187b6",
    is_active: false,
    name_en: "Inactive orchard",
  };
  vi.mocked(listFarms).mockResolvedValue({
    data: [inactive as Farm],
    meta: { page: 1, page_size: 20, total: 1 },
  });
  renderPage(<AdminSupplyRequestList />);
  fireEvent.click(await screen.findByRole("button", { name: "Filter" }));
  expect(listFarms).toHaveBeenCalledWith({ page: 1, search: "" }, expect.any(AbortSignal));
  const select = screen.getByRole("textbox", { name: "Farm" });
  fireEvent.click(select);
  fireEvent.click(await screen.findByRole("option", { name: "Inactive orchard" }));
  fireEvent.click(screen.getByRole("button", { name: "Apply" }));
  expect(window.location.search).toBe(`?farm_id=${inactive.id}`);
});

it("confirms approval once, invalidates affected inventory and leaves an unrelated Farm alone", async () => {
  const pending = deferred<Awaited<ReturnType<typeof decideSupplyRequest>>>();
  vi.mocked(decideSupplyRequest).mockReturnValue(pending.promise);
  renderDetail();
  const approve = await screen.findByRole("button", { name: "Approve" });
  const affectedSource = [...farmSupplyKey(farmId), "source", productId];
  const unrelatedSource = [...farmSupplyKey(farmId), "source", "elsewhere"];
  const affectedList = [...farmSupplyRequestListKey, { status: "pending" }];
  act(() => {
    for (const key of [
      affectedSource,
      unrelatedSource,
      affectedList,
      farmDetailKey(farmId),
      farmListKey,
    ])
      client.setQueryData(key, { initial: true });
  });
  fireEvent.click(approve);
  const dialog = await screen.findByRole("dialog", { name: "Approve supply request" });
  const confirm = within(dialog).getByRole("button", { name: "Approve" });
  fireEvent.click(confirm);
  fireEvent.click(confirm);
  await waitFor(() => expect(decideSupplyRequest).toHaveBeenCalledTimes(1));
  expect(decideSupplyRequest).toHaveBeenCalledWith(requestId, "approve", {
    idempotency_key: expect.any(String),
  });
  expect(client.getMutationCache().find(farmDeleteSupplyWriteFilters(farmId))).toBeDefined();
  await act(async () => pending.resolve({ data: approval, meta: { idempotent_replay: false } }));
  expect(await screen.findByText("Supply request approved.")).toBeVisible();
  expect(client.getQueryData(farmSupplyRequestDetailKey(requestId))).toEqual(approval);
  for (const key of [affectedSource, affectedList, farmDetailKey(farmId), farmListKey])
    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  expect(client.getQueryState(unrelatedSource)?.isInvalidated).toBe(false);
  expect(screen.queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();
});

it("requires a trimmed rejection reason and keeps it when the request fails", async () => {
  vi.mocked(decideSupplyRequest).mockRejectedValue(
    Object.assign(new Error("validation_error"), { status: 400 }),
  );
  renderDetail();
  fireEvent.click(await screen.findByRole("button", { name: "Reject" }));
  const dialog = await screen.findByRole("dialog", { name: "Reject supply request" });
  const reason = within(dialog).getByRole("textbox", { name: "Rejection reason" });
  const confirm = within(dialog).getByRole("button", { name: "Reject" });
  fireEvent.change(reason, { target: { value: "   " } });
  fireEvent.click(confirm);
  expect(decideSupplyRequest).not.toHaveBeenCalled();
  expect(
    within(dialog).getByText("Enter a rejection reason of up to 500 characters."),
  ).toBeVisible();
  fireEvent.change(reason, { target: { value: "  Wrong delivery period  " } });
  fireEvent.click(confirm);
  await waitFor(() => expect(within(dialog).getByRole("alert")).toBeVisible());
  expect(reason).toHaveValue("  Wrong delivery period  ");
  expect(decideSupplyRequest).toHaveBeenCalledWith(requestId, "reject", {
    reason: "Wrong delivery period",
    idempotency_key: expect.any(String),
  });
});

it("retains the exact decision for recovery and never offers the opposite action", async () => {
  vi.mocked(decideSupplyRequest)
    .mockRejectedValueOnce(new Error("network_error"))
    .mockResolvedValueOnce({ data: approval, meta: { idempotent_replay: true } });
  renderDetail();
  fireEvent.click(await screen.findByRole("button", { name: "Approve" }));
  const dialog = await screen.findByRole("dialog", { name: "Approve supply request" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Approve" }));
  const retry = await screen.findByRole("button", { name: "Retry decision" });
  expect(adminSupplyRequest).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();
  expect(client.getMutationCache().find(farmDeleteSupplyWriteFilters(farmId))).toBeDefined();
  fireEvent.click(retry);
  expect(await screen.findByText("Supply request approved.")).toBeVisible();
  expect(vi.mocked(decideSupplyRequest).mock.calls[0]).toEqual(
    vi.mocked(decideSupplyRequest).mock.calls[1],
  );
});

it("reconciles a concurrently processed request without claiming the decision as its own", async () => {
  vi.mocked(decideSupplyRequest).mockRejectedValue(
    Object.assign(new Error("farm_supply_request_processed"), { status: 409 }),
  );
  renderDetail();
  const approve = await screen.findByRole("button", { name: "Approve" });
  vi.mocked(adminSupplyRequest).mockResolvedValue(approval);
  fireEvent.click(approve);
  const dialog = await screen.findByRole("dialog", { name: "Approve supply request" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Approve" }));
  expect(
    await screen.findByText("The request has been processed. Its current status is shown."),
  ).toBeVisible();
  expect(screen.queryByText("Supply request approved.")).not.toBeInTheDocument();
});

it("identifies the item in product identity and source generation conflicts", async () => {
  vi.mocked(decideSupplyRequest)
    .mockRejectedValueOnce(
      Object.assign(new Error("product_identity_changed"), {
        status: 409,
        payload: { errors: [{ context: { product_id: productId, item_index: 0 } }] },
      }),
    )
    .mockRejectedValueOnce(
      Object.assign(new Error("farm_product_generation_changed"), {
        status: 409,
        payload: { errors: [{ context: { product_id: productId, item_index: 0 } }] },
      }),
    );
  renderDetail();
  fireEvent.click(await screen.findByRole("button", { name: "Approve" }));
  const dialog = await screen.findByRole("dialog", { name: "Approve supply request" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Approve" }));
  expect(
    await within(dialog).findByText("Greens · The product code or sale unit has changed."),
  ).toBeVisible();
  fireEvent.click(within(dialog).getByRole("button", { name: "Approve" }));
  expect(
    await within(dialog).findByText("Greens · The product was removed and added back to supply."),
  ).toBeVisible();
});

it("retires request snapshots on actual permission loss", async () => {
  vi.mocked(decideSupplyRequest).mockRejectedValue(
    Object.assign(new Error("forbidden"), { status: 403 }),
  );
  renderDetail();
  fireEvent.click(await screen.findByRole("button", { name: "Approve" }));
  const dialog = await screen.findByRole("dialog", { name: "Approve supply request" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Approve" }));
  await waitFor(() => expect(farmAccess(client).error?.message).toBe("forbidden"));
  expect(screen.queryByText("Greens")).not.toBeInTheDocument();
  expect(client.getQueryData(farmSupplyRequestDetailKey(requestId))).toBeUndefined();
  expect(client.getMutationCache().find(farmDeleteSupplyWriteFilters(farmId))).toBeUndefined();
});

it("cancels a stale list read and never projects rows from a previously applied search", async () => {
  params = new URLSearchParams("search=before");
  const stale = deferred<ReturnType<typeof queryResponse>>();
  const newSearch = deferred<ReturnType<typeof queryResponse>>();
  vi.mocked(adminSupplyRequests)
    .mockResolvedValueOnce(queryResponse([entry]))
    .mockReturnValueOnce(stale.promise)
    .mockReturnValueOnce(newSearch.promise);
  const view = renderPage(<AdminSupplyRequestList />);
  await screen.findByRole("link", { name: entry.code });
  fireEvent.click(screen.getByRole("button", { name: "Refresh supply requests" }));
  const staleSignal = vi.mocked(adminSupplyRequests).mock.calls[1]?.[1];
  expect(staleSignal?.aborted).toBe(false);
  params = new URLSearchParams("search=after&status=pending&page=2");
  view.rerender(<AdminSupplyRequestList />);
  expect(staleSignal?.aborted).toBe(true);
  expect(screen.queryByRole("link", { name: entry.code })).not.toBeInTheDocument();
  await act(async () => stale.resolve(queryResponse([{ ...entry, code: "FSR-STALE" }])));
  expect(screen.queryByRole("link", { name: "FSR-STALE" })).not.toBeInTheDocument();
  await act(async () => newSearch.resolve(queryResponse([{ ...entry, code: "FSR-CURRENT" }], 2)));
  expect(await screen.findByRole("link", { name: "FSR-CURRENT" })).toBeVisible();
  expect(adminSupplyRequests).toHaveBeenLastCalledWith(
    { page: 2, search: "after", status: "pending" },
    expect.any(AbortSignal),
  );
});

it("does not apply a late successful decision after access scope retirement", async () => {
  const pending = deferred<Awaited<ReturnType<typeof decideSupplyRequest>>>();
  vi.mocked(decideSupplyRequest).mockReturnValue(pending.promise);
  renderDetail();
  fireEvent.click(await screen.findByRole("button", { name: "Approve" }));
  const dialog = await screen.findByRole("dialog", { name: "Approve supply request" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Approve" }));
  await waitFor(() => expect(decideSupplyRequest).toHaveBeenCalledTimes(1));
  act(() => retireFarmAccess(client, new Error("session_changed")));
  await act(async () => pending.resolve({ data: approval, meta: { idempotent_replay: false } }));
  expect(client.getQueryData(farmSupplyRequestDetailKey(requestId))).toBeUndefined();
  expect(screen.queryByText("Supply request approved.")).not.toBeInTheDocument();
  await waitFor(() => expect(screen.queryByText("Greens")).not.toBeInTheDocument());
});

it("shows the confirmed rejection and leaves stock query snapshots current", async () => {
  const rejection = {
    ...entry,
    status: "rejected" as const,
    processed_at: approval.processed_at,
    rejection_reason: "Duplicate",
  };
  vi.mocked(decideSupplyRequest).mockResolvedValue({
    data: rejection,
    meta: { idempotent_replay: false },
  });
  renderDetail();
  const stock = [...farmSupplyKey(farmId), "batches", productId];
  act(() => client.setQueryData(stock, { quantity: 2 }));
  fireEvent.click(await screen.findByRole("button", { name: "Reject" }));
  const dialog = await screen.findByRole("dialog", { name: "Reject supply request" });
  fireEvent.change(within(dialog).getByRole("textbox", { name: "Rejection reason" }), {
    target: { value: "Duplicate" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Reject" }));
  expect(await screen.findByText("Supply request rejected.")).toBeVisible();
  expect(screen.getByText("Duplicate")).toBeVisible();
  expect(client.getQueryState(stock)?.isInvalidated).toBe(false);
  expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
});

it("restores focus to the Drawer close button when confirmed approval removes the action", async () => {
  vi.mocked(adminSupplyRequests).mockResolvedValue(queryResponse([entry]));
  vi.mocked(adminSupplyRequest).mockResolvedValue(entry);
  vi.mocked(decideSupplyRequest).mockResolvedValue({
    data: approval,
    meta: { idempotent_replay: false },
  });
  renderPage(<AdminSupplyRequestList />);
  fireEvent.click(await screen.findByRole("link", { name: entry.code }));
  const drawer = await screen.findByRole("dialog", { name: "Request details" });
  const approve = await within(drawer).findByRole("button", { name: "Approve" });
  approve.focus();
  fireEvent.click(approve);
  const dialog = await screen.findByRole("dialog", { name: "Approve supply request" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Approve" }));
  expect(await screen.findByText("Supply request approved.")).toBeVisible();
  const close = within(drawer).getByRole("button", { name: "Close" });
  await waitFor(() => expect(close).toHaveFocus());
});
