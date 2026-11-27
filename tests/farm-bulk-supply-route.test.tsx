import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import FarmBulkSupplyPage from "@/app/(admin)/farms/[id]/stock-batches/new/page";
import {
  AdminBreadcrumbProvider,
  useAdminBreadcrumbs,
} from "@/components/admin-breadcrumb-context";
import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { AdminQueryProvider } from "@/components/admin-query-provider";
import { ToastProvider } from "@/components/toast-provider";
import { FarmBulkSupply } from "@/components/farm-bulk-supply";
import { getFarm, listFarmProducts, postFarmBulkSupply } from "@/lib/farms-api";
import type { FarmBulkSupplyDraft, FarmBulkSupplyInput } from "@/lib/farm-bulk-draft";
import {
  confirmFarmGone,
  farmBulkDraftKey,
  retireFarmAccess,
  retryFarmAccess,
} from "@/lib/farm-query";
import type { Farm, FarmProduct } from "@/lib/types";

const nav = vi.hoisted(() => ({
  replace: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("not_found");
  }),
  redirect: vi.fn(() => {
    throw new Error("redirect");
  }),
  search: new URLSearchParams(
    "search=%2B8491&page=4&supply_search=rau&supply_page=2&supply_status=all",
  ),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace }),
  useSearchParams: () => nav.search,
  notFound: nav.notFound,
  redirect: nav.redirect,
}));
vi.mock("@/lib/farms-api", async (original) => ({
  ...(await original<typeof import("@/lib/farms-api")>()),
  getFarm: vi.fn(),
  listFarmProducts: vi.fn(),
  postFarmBulkSupply: vi.fn(),
}));
vi.mock("@/components/farm-bulk-supply-form", () => ({
  FarmSupplyForm: ({
    pagination,
    onSearch,
    onCancel,
    draft,
    onDraftChange,
    onSubmit,
    review,
  }: {
    pagination?: { page: number; onChange: (page: number) => void };
    onSearch: (value: string) => void;
    onCancel: () => void;
    draft: FarmBulkSupplyDraft;
    onDraftChange: (draft: FarmBulkSupplyDraft) => void;
    onSubmit: (input: FarmBulkSupplyInput) => void;
    review?: ReactNode;
  }) => (
    <>
      <button disabled={!pagination} onClick={() => pagination?.onChange(2)}>
        Page two
      </button>
      <button onClick={() => onSearch("  tomato  ")}>Apply search</button>
      <button onClick={onCancel}>Cancel route</button>
      <button onClick={() => onDraftChange(unsavedDraft)}>Edit draft</button>
      <button onClick={() => onDraftChange({ ...unsavedDraft, end_date: "20/12/2099" })}>
        Edit again
      </button>
      <button
        onClick={() =>
          onSubmit({
            start_date: "2099-11-30",
            end_date: "2099-12-06",
            items: [
              {
                product_id: product.product_id,
                expected_link_id: product.id,
                expected_version: 7,
                quantity_units: 25,
              },
            ],
          })
        }
      >
        Send draft
      </button>
      {review}
      <output data-testid="draft">{JSON.stringify(draft)}</output>
    </>
  ),
}));

const id = "aaaaaaaa-1234-4567-8934-123456789abc";
const farm: Farm = {
  id,
  name_en: "Green Farm",
  name_vi: "Trang trại Xanh",
  location_en: "Da Lat",
  location_vi: "Đà Lạt",
  contact_phone: "",
  description_en: "",
  description_vi: "",
  version: 2,
  is_active: false,
  image: null,
  photos: [],
  in_stock_product_count: 0,
  out_of_stock_product_count: 25,
  created_at: "2026-11-01",
  updated_at: "2026-11-01",
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("fetches eligible pages only for the opened Farm and keeps return context", async () => {
  vi.mocked(getFarm).mockResolvedValue(farm);
  vi.mocked(listFarmProducts).mockImplementation(async (_id, query) => ({
    data: [],
    meta: { page: query?.page ?? 1, page_size: 20, total: 25 },
  }));
  render(
    <AdminI18nProvider initialLocale="en">
      <AdminQueryProvider>
        <ToastProvider>
          <FarmBulkSupply farmId={id} />
        </ToastProvider>
      </AdminQueryProvider>
    </AdminI18nProvider>,
  );
  expect(screen.getByRole("heading", { level: 1, name: "Add supply" })).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole("button", { name: "Page two" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Page two" }));
  await waitFor(() =>
    expect(listFarmProducts).toHaveBeenLastCalledWith(
      id,
      { supplyStatus: "supplying", productStatus: "active", search: "", page: 2 },
      expect.any(AbortSignal),
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "Apply search" }));
  await waitFor(() =>
    expect(listFarmProducts).toHaveBeenLastCalledWith(
      id,
      { supplyStatus: "supplying", productStatus: "active", search: "tomato", page: 1 },
      expect.any(AbortSignal),
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "Cancel route" }));
  expect(nav.replace).toHaveBeenCalledWith(
    `/farms/${id}?search=%2B8491&page=4&supply_search=rau&supply_status=all&supply_page=2`,
  );
  expect(getFarm).toHaveBeenCalledTimes(1);
});

it("validates the Farm UUID and canonicalizes uppercase links", async () => {
  await expect(
    FarmBulkSupplyPage({
      params: Promise.resolve({ id: "bad" }),
      searchParams: Promise.resolve({}),
    }),
  ).rejects.toThrow("not_found");
  await expect(
    FarmBulkSupplyPage({
      params: Promise.resolve({ id: id.toUpperCase() }),
      searchParams: Promise.resolve({ supply_page: "2" }),
    }),
  ).rejects.toThrow("redirect");
  expect(nav.redirect).toHaveBeenCalledWith(`/farms/${id}/stock-batches/new?supply_page=2`);
});

const otherId = "bbbbbbbb-1234-4567-8934-123456789abc";
const product = {
  id: "source-before-refresh",
  farm_id: id,
  product_id: "product-1",
  version: 7,
} as FarmProduct;
const unsavedDraft: FarmBulkSupplyDraft = {
  start_date: "30/11/2099",
  end_date: "06/12/2099",
  items: { "product-1": { product, quantity: "25" } },
};

function draftJourney() {
  vi.mocked(getFarm).mockImplementation(async (farmId) => ({ ...farm, id: farmId }));
  vi.mocked(listFarmProducts).mockImplementation(async (_id, query) => ({
    data: [{ ...product, id: "source-after-refresh", version: 8 }],
    meta: { page: query?.page ?? 1, page_size: 20, total: 1 },
  }));
  let client!: ReturnType<typeof useQueryClient>;
  let retireSession: (() => void) | null = null;
  function CaptureClient() {
    client = useQueryClient();
    return null;
  }
  function tree(farmId: string | null, session: string) {
    return (
      <AdminI18nProvider initialLocale="en">
        <AdminQueryProvider
          key={session}
          ref={(retire) => {
            retireSession = retire;
          }}
        >
          <CaptureClient />
          <ToastProvider>{farmId && <FarmBulkSupply farmId={farmId} />}</ToastProvider>
        </AdminQueryProvider>
      </AdminI18nProvider>
    );
  }
  const view = render(tree(id, "first-session"));
  return {
    client: () => client,
    navigate: (farmId: string | null, session = "first-session") =>
      view.rerender(tree(farmId, session)),
    retire: () => retireSession?.(),
  };
}

function currentDraft(): FarmBulkSupplyDraft {
  return JSON.parse(screen.getByTestId("draft").textContent ?? "");
}

it("keeps pre-submit dates, quantities and the original source revision across navigation within one Farm and session", async () => {
  const journey = draftJourney();
  fireEvent.click(await screen.findByRole("button", { name: "Edit draft" }));
  journey.navigate(null);
  journey.navigate(otherId);
  await screen.findByTestId("draft");
  expect(currentDraft().items).toEqual({});
  journey.navigate(id);
  await screen.findByTestId("draft");
  expect(currentDraft()).toEqual(unsavedDraft);
});

it("discards only the confirmed Farm draft", async () => {
  const journey = draftJourney();
  fireEvent.click(await screen.findByRole("button", { name: "Edit draft" }));
  journey.client().setQueryData(farmBulkDraftKey(otherId), unsavedDraft);
  fireEvent.click(screen.getByRole("button", { name: "Cancel route" }));
  expect(journey.client().getQueryData(farmBulkDraftKey(id))).toEqual(unsavedDraft);
  fireEvent.click(await screen.findByRole("button", { name: "Discard draft" }));
  expect(journey.client().getQueryData(farmBulkDraftKey(id))).toBeUndefined();
  expect(journey.client().getQueryData(farmBulkDraftKey(otherId))).toEqual(unsavedDraft);
  journey.navigate(null);
  journey.navigate(id);
  await screen.findByTestId("draft");
  expect(currentDraft().items).toEqual({});
});

it("retirement of Farm permission removes the observed draft before retrying access", async () => {
  const journey = draftJourney();
  fireEvent.click(await screen.findByRole("button", { name: "Edit draft" }));
  expect(journey.client().getQueryData(farmBulkDraftKey(id))).toEqual(unsavedDraft);
  act(() =>
    retireFarmAccess(journey.client(), Object.assign(new Error("forbidden"), { status: 403 })),
  );
  await waitFor(() => expect(screen.queryByTestId("draft")).not.toBeInTheDocument());
  expect(journey.client().getQueryData(farmBulkDraftKey(id))).toBeUndefined();
  act(() => retryFarmAccess(journey.client()));
  await screen.findByTestId("draft");
  expect(currentDraft().items).toEqual({});
});

it("confirmed Farm deletion removes only its draft", async () => {
  const journey = draftJourney();
  fireEvent.click(await screen.findByRole("button", { name: "Edit draft" }));
  expect(journey.client().getQueryData(farmBulkDraftKey(id))).toEqual(unsavedDraft);
  journey.client().setQueryData(farmBulkDraftKey(otherId), unsavedDraft);
  act(() => confirmFarmGone(journey.client(), id));
  expect(journey.client().getQueryData(farmBulkDraftKey(id))).toBeUndefined();
  expect(journey.client().getQueryData(farmBulkDraftKey(otherId))).toEqual(unsavedDraft);
});

it("retires the draft and never restores it in another admin session", async () => {
  const journey = draftJourney();
  fireEvent.click(await screen.findByRole("button", { name: "Edit draft" }));
  const previous = journey.client();
  expect(previous.getQueryData(farmBulkDraftKey(id))).toEqual(unsavedDraft);
  act(() => journey.retire());
  expect(previous.getQueryData(farmBulkDraftKey(id))).toBeUndefined();
  journey.navigate(id, "second-session");
  await screen.findByTestId("draft");
  expect(journey.client()).not.toBe(previous);
  expect(currentDraft().items).toEqual({});
});

it("keeps pending and unknown submitted data intact when an edit arrives", async () => {
  let fail!: (error: Error) => void;
  vi.mocked(postFarmBulkSupply).mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        fail = reject;
      }),
  );
  const journey = draftJourney();
  fireEvent.click(await screen.findByRole("button", { name: "Edit draft" }));
  fireEvent.click(screen.getByRole("button", { name: "Send draft" }));
  fireEvent.click(screen.getByRole("button", { name: "Edit again" }));
  expect(journey.client().getQueryData(farmBulkDraftKey(id))).toEqual(unsavedDraft);
  await waitFor(() => expect(fail).toBeTypeOf("function"));
  await act(async () => {
    fail(new Error("network_error"));
  });
  journey.navigate(null);
  journey.navigate(id);
  await screen.findByText("The outcome is unknown. Supply may have been saved.");
  fireEvent.click(screen.getByRole("button", { name: "Edit again" }));
  expect(currentDraft()).toEqual(unsavedDraft);
  expect(postFarmBulkSupply).toHaveBeenCalledTimes(1);
  const submitted = vi.mocked(postFarmBulkSupply).mock.calls[0][1];
  expect(submitted.items[0]).toMatchObject({
    expected_link_id: product.id,
    expected_version: 7,
    quantity_units: 25,
  });
  expect(Object.isFrozen(submitted)).toBe(true);
});

it("registers the bulk breadcrumb immediately and adds the actual Farm name after loading", async () => {
  let finish!: (value: Farm) => void;
  vi.mocked(getFarm).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  vi.mocked(listFarmProducts).mockResolvedValue({
    data: [],
    meta: { page: 1, page_size: 20, total: 0 },
  });
  function HeaderTrail() {
    const items = useAdminBreadcrumbs([]);
    return (
      <nav>
        {items.map(({ label, href }) =>
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
  render(
    <AdminI18nProvider initialLocale="en">
      <AdminQueryProvider>
        <ToastProvider>
          <AdminBreadcrumbProvider
            pathname={`/farms/${id}/stock-batches/new`}
            search={nav.search.toString()}
          >
            <HeaderTrail />
            <FarmBulkSupply farmId={id} />
          </AdminBreadcrumbProvider>
        </ToastProvider>
      </AdminQueryProvider>
    </AdminI18nProvider>,
  );
  const trail = screen.getByRole("navigation");
  expect(trail).toHaveTextContent("Add supply");
  expect(trail).not.toHaveTextContent("Farm details");
  await act(async () => {
    finish(farm);
  });
  expect(await screen.findByRole("link", { name: farm.name_en })).toHaveAttribute(
    "href",
    `/farms/${id}?search=%2B8491&page=4&supply_search=rau&supply_status=all&supply_page=2`,
  );
});
