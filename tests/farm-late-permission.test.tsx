import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { AdminQueryProvider } from "@/components/admin-query-provider";
import { FarmDetail } from "@/components/farm-detail";
import { FarmList } from "@/components/farm-list";
import { ToastProvider } from "@/components/toast-provider";
import type { Farm, FarmProductDetail } from "@/lib/types";

const api = vi.hoisted(() => ({
  getFarm: vi.fn(),
  getFarmTracker: vi.fn(),
  listFarms: vi.fn(),
  listFarmProducts: vi.fn(),
  getFarmProduct: vi.fn(),
  listFarmStockBatches: vi.fn(),
  removeFarmProduct: vi.fn(),
  deleteFarm: vi.fn(),
  saveFarm: vi.fn(),
  listAvailableFarmProducts: vi.fn(),
  linkFarmProducts: vi.fn(),
  recoverFarmProductLinking: vi.fn(),
}));
vi.mock("@/lib/farms-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/farms-api")>()),
  ...api,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => search,
}));

const farm: Farm = {
  id: "farm",
  name_vi: "Trang trại bảo vệ",
  name_en: "Protected farm",
  location_vi: "Huế",
  location_en: "Hue",
  contact_phone: "",
  description_vi: "",
  description_en: "",
  image: null,
  photos: [],
  is_active: true,
  capabilities: { delete: { allowed: true, reasons: [] } },
  version: 1,
  in_stock_product_count: 1,
  out_of_stock_product_count: 0,
  created_at: "2026-10-01",
  updated_at: "2026-10-01",
};
const source: FarmProductDetail = {
  id: "source",
  product_id: "product",
  farm_id: farm.id,
  sku: "CAB",
  name_vi: "Cải",
  name_en: "Cabbage",
  unit_size: "1",
  unit_label_en: "kg",
  unit_label_vi: "kg",
  product_status: "active",
  is_active: true,
  supply_status: "supplying",
  removed_at: null,
  version: 1,
  supply_generation: 1,
  available_quantity: 1,
  initial_quantity: 1,
  net_sold_quantity: 0,
  batch_count: 1,
  active_batch_count: 1,
  has_supply_history: true,
  next_expiry_date: null,
  capabilities: {
    can_remove: true,
    can_create_batch: true,
    can_readd: false,
    blockers: { readd: { code: "farm_product_not_removed" } },
  },
};
const page = { page: 1, page_size: 20, total: 0 };
const pickerProduct = {
  id: source.product_id,
  sku: source.sku,
  name_vi: source.name_vi,
  name_en: source.name_en,
  unit_size: source.unit_size,
  unit_label_vi: source.unit_label_vi,
  unit_label_en: source.unit_label_en,
  link_state: "unlinked",
  removed_source: null,
};
let client: QueryClient;
let search: URLSearchParams | null;
function CaptureClient() {
  client = useQueryClient();
  return null;
}
const deny = () => Object.assign(new Error("forbidden"), { status: 403 });

function screenFor(view: "source" | "farm" | "list" | "editor", binding = "original") {
  search = view === "editor" ? new URLSearchParams("tab=information") : null;
  return (
    <AdminI18nProvider initialLocale="vi">
      <ToastProvider>
        <AdminQueryProvider key={binding}>
          <CaptureClient />
          {view === "list" ? (
            <FarmList />
          ) : (
            <FarmDetail farmId={farm.id} productId={view === "source" ? "product" : undefined} />
          )}
        </AdminQueryProvider>
      </ToastProvider>
    </AdminI18nProvider>
  );
}

function deferred() {
  let resolve!: (value: unknown) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

async function startRemove() {
  fireEvent.click(await screen.findByRole("button", { name: "Gỡ sản phẩm" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Gỡ sản phẩm" }));
  await waitFor(() => expect(api.removeFarmProduct).toHaveBeenCalledOnce());
}

beforeEach(() => {
  Object.values(api).forEach((mock) => mock.mockReset());
  api.getFarm.mockResolvedValue(farm);
  api.getFarmTracker.mockRejectedValue(Object.assign(new Error("not_found"), { status: 404 }));
  api.listFarms.mockResolvedValue({ data: [farm], meta: { ...page, total: 1 } });
  api.listFarmProducts.mockResolvedValue({ data: [source], meta: { ...page, total: 1 } });
  api.getFarmProduct.mockResolvedValue(source);
  api.listFarmStockBatches.mockResolvedValue({ data: [], meta: page });
  api.listAvailableFarmProducts.mockResolvedValue({
    data: [pickerProduct],
    meta: { page: 1, page_size: 30, total: 1 },
  });
});
afterEach(cleanup);

it("retires an active cached Farm after a late Remove 403 without sending a GET until retry", async () => {
  const pending = deferred();
  api.removeFarmProduct.mockReturnValue(pending.promise);
  const screenView = render(screenFor("source"));
  await startRemove();
  screenView.rerender(screenFor("farm"));
  expect(await screen.findByRole("heading", { name: farm.name_vi })).toBeVisible();
  expect(api.getFarm).toHaveBeenCalledTimes(1);
  await act(async () => pending.reject(deny()));
  await waitFor(() =>
    expect(screen.queryByRole("heading", { name: farm.name_vi })).not.toBeInTheDocument(),
  );
  expect(screen.queryByRole("button", { name: "Thêm sản phẩm" })).not.toBeInTheDocument();
  expect(api.getFarm).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
  expect(await screen.findByRole("heading", { name: farm.name_vi })).toBeVisible();
  expect(api.getFarm).toHaveBeenCalledTimes(2);
});

it("ignores a late Farm permission denial after a new AdminQueryProvider session is mounted", async () => {
  const pending = deferred();
  api.removeFarmProduct.mockReturnValue(pending.promise);
  const screenView = render(screenFor("source"));
  await startRemove();
  screenView.rerender(screenFor("farm", "new"));
  expect(await screen.findByRole("heading", { name: farm.name_vi })).toBeVisible();
  await act(async () => pending.reject(deny()));
  expect(screen.getByRole("heading", { name: farm.name_vi })).toBeVisible();
  expect(api.getFarm).toHaveBeenCalledTimes(2);
});

async function openPicker() {
  const add = await screen.findByRole("button", { name: "Thêm sản phẩm" });
  await waitFor(() => expect(add).toBeEnabled());
  fireEvent.click(add);
  return within(await screen.findByRole("dialog", { name: "Thêm sản phẩm" }));
}

async function startAdd() {
  const picker = await openPicker();
  fireEvent.click(await picker.findByRole("checkbox", { name: /Cải/ }));
  fireEvent.click(picker.getByRole("button", { name: "Thêm sản phẩm" }));
  await waitFor(() => expect(api.linkFarmProducts).toHaveBeenCalledOnce());
}

it("retires the active source after late Add denial and prevents an earlier GET from hydrating the cache", async () => {
  const pending = deferred();
  api.linkFarmProducts.mockReturnValue(pending.promise);
  const activeSourceRead = deferred();
  api.getFarmProduct.mockResolvedValueOnce(source).mockReturnValueOnce(activeSourceRead.promise);
  const screenView = render(screenFor("source"));
  expect(await screen.findByRole("heading", { name: source.name_vi })).toBeVisible();
  screenView.rerender(screenFor("farm"));
  await startAdd();
  screenView.rerender(screenFor("source"));
  await waitFor(() => expect(api.getFarmProduct).toHaveBeenCalledTimes(2));
  const signal = api.getFarmProduct.mock.calls[1][2] as AbortSignal;
  await act(async () => pending.reject(deny()));
  expect(await screen.findByRole("alert")).toHaveTextContent("không có quyền");
  expect(screen.queryByRole("heading", { name: source.name_vi })).not.toBeInTheDocument();
  expect(signal.aborted).toBe(true);
  await act(async () => activeSourceRead.resolve(source));
  expect(screen.queryByRole("link", { name: "Bổ sung nguồn cung" })).not.toBeInTheDocument();
  expect(
    client.getQueryData(["farm-supply", farm.id, "source", source.product_id]),
  ).toBeUndefined();
});

it("refreshes only the applicable cached list when a successful Add settles after navigation", async () => {
  const pending = deferred();
  api.linkFarmProducts.mockReturnValue(pending.promise);
  const screenView = render(screenFor("farm"));
  await startAdd();
  screenView.rerender(screenFor("list"));
  expect(await screen.findByRole("link", { name: farm.name_vi })).toBeVisible();
  await act(async () => pending.resolve(source));
  await waitFor(() => expect(api.listFarms).toHaveBeenCalledTimes(2));
  expect(api.getFarm).toHaveBeenCalledTimes(1);
  expect(api.listAvailableFarmProducts).toHaveBeenCalledTimes(1);
  expect(api.getFarmProduct).not.toHaveBeenCalled();
  expect(
    client.getMutationCache().findAll({ mutationKey: ["farm-supply", farm.id, "write"] }),
  ).toHaveLength(0);
});

it("keeps the catalog idle after an uncertain link and checks only the original receipt", async () => {
  const pending = deferred();
  api.linkFarmProducts.mockReturnValue(pending.promise);
  api.recoverFarmProductLinking.mockRejectedValue(new Error("invalid_response"));
  const screenView = render(screenFor("farm"));
  await startAdd();
  screenView.rerender(screenFor("list"));
  client.removeQueries({ queryKey: ["farm-supply", farm.id, "available"] });
  await act(async () =>
    pending.reject(Object.assign(new Error("request_timeout"), { status: 408 })),
  );
  screenView.rerender(screenFor("farm"));
  const picker = within(await screen.findByRole("dialog"));
  fireEvent.click(await picker.findByRole("button", { name: "Kiểm tra biên nhận" }));
  expect(await picker.findByText(/Chưa xác định kết quả/)).toBeVisible();
  expect(picker.getByText("Đã chọn 1 sản phẩm")).toBeVisible();
  expect(picker.queryByRole("checkbox")).not.toBeInTheDocument();
  expect(picker.queryByText("Đang tải nguồn cung…")).not.toBeInTheDocument();
  expect(picker.queryByRole("search")).not.toBeInTheDocument();
  expect(api.listAvailableFarmProducts).toHaveBeenCalledTimes(1);
  expect(api.getFarmProduct).not.toHaveBeenCalled();
  expect(api.recoverFarmProductLinking).toHaveBeenCalledExactlyOnceWith(
    farm.id,
    api.linkFarmProducts.mock.calls[0][1],
  );
  expect(api.linkFarmProducts).toHaveBeenCalledTimes(1);
  expect(
    client.getMutationCache().findAll({ mutationKey: ["farm-supply", farm.id, "write"] }),
  ).toHaveLength(1);
});

it("retires linking state after an unscoped POST 404 and a verified missing Farm", async () => {
  const notFound = Object.assign(new Error("not_found"), { status: 404 });
  api.getFarm.mockResolvedValueOnce(farm).mockRejectedValueOnce(notFound);
  api.linkFarmProducts.mockRejectedValueOnce(notFound);
  render(screenFor("farm"));
  await startAdd();
  expect(await screen.findByText("Không tìm thấy trang trại.")).toBeVisible();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(api.recoverFarmProductLinking).not.toHaveBeenCalled();
  expect(api.getFarm).toHaveBeenCalledTimes(2);
  expect(
    client.getMutationCache().findAll({ mutationKey: ["farm-supply", farm.id, "write"] }),
  ).toHaveLength(0);
});

it("keeps an uncertain intent when a legacy proxy rejects an exact retry with 404", async () => {
  api.linkFarmProducts
    .mockRejectedValueOnce(Object.assign(new Error("request_timeout"), { status: 408 }))
    .mockRejectedValueOnce(Object.assign(new Error("backend_route_not_allowed"), { status: 404 }));
  render(screenFor("farm"));
  await startAdd();
  const dialog = within(await screen.findByRole("dialog"));
  fireEvent.click(await dialog.findByRole("button", { name: "Gửi lại giao dịch này" }));
  await waitFor(() => expect(api.linkFarmProducts).toHaveBeenCalledTimes(2));
  expect(api.linkFarmProducts.mock.calls[1][1]).toBe(api.linkFarmProducts.mock.calls[0][1]);
  expect(await dialog.findByText(/Chưa xác định kết quả/)).toBeVisible();
  expect(dialog.getByRole("button", { name: "Thêm sản phẩm" })).toBeDisabled();
  expect(api.getFarm).toHaveBeenCalledTimes(1);
});

it("shows actual initial picker loading, then error and empty state after an explicit retry", async () => {
  const pending = deferred();
  api.listAvailableFarmProducts
    .mockReturnValueOnce(pending.promise)
    .mockResolvedValueOnce({ data: [], meta: { page: 1, page_size: 30, total: 0 } });
  render(screenFor("farm"));
  const picker = await openPicker();
  expect(await picker.findByText("Đang tải nguồn cung…")).toBeVisible();
  await act(async () => pending.reject(new Error("network_error")));
  fireEvent.click(
    within(await picker.findByRole("alert")).getByRole("button", { name: "Thử lại" }),
  );
  expect(await picker.findByText("Không có sản phẩm để thêm.")).toBeVisible();
  expect(api.listAvailableFarmProducts).toHaveBeenCalledTimes(2);
});

it("does not publish a late Farm save after access was retired elsewhere in the same session", async () => {
  const save = deferred();
  api.saveFarm.mockReturnValue(save.promise);
  api.getFarmProduct.mockRejectedValueOnce(deny());
  const screenView = render(screenFor("editor"));
  const name = await screen.findByDisplayValue(farm.name_vi);
  expect(name).toBeVisible();
  fireEvent.change(name, { target: { value: "Tên của phản hồi cũ" } });
  const submit = screen.getByRole("button", { name: "Lưu thay đổi" });
  await waitFor(() => expect(submit).toBeEnabled());
  fireEvent.click(submit);
  await waitFor(() => expect(api.saveFarm).toHaveBeenCalledOnce());
  screenView.rerender(screenFor("source"));
  expect(await screen.findByRole("alert")).toHaveTextContent("không có quyền");
  await act(async () => save.resolve({ ...farm, name_vi: "Tên của phản hồi cũ", version: 2 }));
  expect(screen.queryByText("Tên của phản hồi cũ")).not.toBeInTheDocument();
  expect(client.getQueryData(["farms", "detail", farm.id])).toBeUndefined();
});

it("retires Farm List when an obsolete Farm delete receives a same-session denial", async () => {
  const pending = deferred();
  api.deleteFarm.mockReturnValue(pending.promise);
  const screenView = render(screenFor("farm"));
  fireEvent.click(await screen.findByRole("button", { name: "Tùy chọn khác" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Xóa trang trại" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Xóa" }));
  await waitFor(() => expect(api.deleteFarm).toHaveBeenCalledOnce());
  screenView.rerender(screenFor("list"));
  expect(await screen.findByRole("link", { name: farm.name_vi })).toBeVisible();
  await act(async () => pending.reject(deny()));
  expect(await screen.findByRole("alert")).toHaveTextContent("không có quyền");
  expect(screen.queryByRole("link", { name: farm.name_vi })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Tùy chọn khác" })).not.toBeInTheDocument();
  expect(api.listFarms).toHaveBeenCalledTimes(1);
});

it("keeps authorized reads after a write is rejected by the BFF CSRF check", async () => {
  api.removeFarmProduct.mockRejectedValue(
    Object.assign(new Error("csrf_rejected"), { status: 403 }),
  );
  render(screenFor("source"));
  await startRemove();
  expect(await within(screen.getByRole("dialog")).findByRole("alert")).toHaveTextContent(
    "không có quyền",
  );
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Hủy" }));
  expect(screen.getByRole("heading", { name: source.name_vi })).toBeVisible();
  expect(api.getFarmProduct).toHaveBeenCalledTimes(1);
});
