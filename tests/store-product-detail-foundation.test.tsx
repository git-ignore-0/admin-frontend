import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  AdminBreadcrumbProvider,
  useAdminBreadcrumbs,
} from "@/components/admin-breadcrumb-context";
import { AdminHeaderContent } from "@/components/admin-header";
import { StoreProductDetail } from "@/components/store-product-detail";
import { adminDictionaries } from "@/lib/admin-i18n";
import { descriptionText } from "@/lib/store-product-description";
import type { StoreProductDetail as Product } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  search: new URLSearchParams(),
  locale: "vi" as "vi" | "en",
  load: vi.fn(),
  remove: vi.fn(),
  transition: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  isCurrent: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => mocks.search,
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
}));
vi.mock("@/components/admin-i18n-provider", () => ({
  useAdminI18n: () => ({ locale: mocks.locale, t: adminDictionaries[mocks.locale] }),
}));
vi.mock("@/components/admin-query-provider", () => ({
  useIsAdminQueryScopeCurrent: () => mocks.isCurrent,
}));
vi.mock("@/components/toast-provider", () => ({ useToast: () => mocks.toast }));
vi.mock("@/lib/commerce-api", () => ({
  getStoreProduct: mocks.load,
  deleteStoreProduct: mocks.remove,
  transitionStoreProduct: mocks.transition,
}));
vi.mock("@/components/lazy-rich-text-editor", () => ({
  LazyRichTextEditor: ({
    value,
  }: Pick<import("@/components/rich-text-editor").RichTextEditorProps, "value">) => (
    <div>{descriptionText(value)}</div>
  ),
}));

const listPath = "/store-catalog/products";
const productId = "7d48eaec-88c0-4114-83ab-e55b058aae3d";
const categoryId = "77cb54b5-a8e7-4490-8781-dc2cb026d859";
const pathname = `${listPath}/${productId}`;
const filters = {
  search: "rau muống",
  status: "draft",
  category_id: categoryId,
  csa_eligible: "true",
  page: "3",
};
const storedProduct: Product = {
  version: 1,
  id: productId,
  category_id: categoryId,
  category_slug: "rau-la",
  sku: "RAU-MUONG-01",
  slug: "rau-muong-01",
  unit_size: "0.500",
  unit_label_vi: "kg",
  unit_label_en: "kg",
  retail_price_vnd: "90000",
  csa_quota_group_id: null,
  csa_quota_group: null,
  csa_quota_cost: 0,
  primary_image_id: null,
  primary_image: null,
  status: "draft",
  capabilities: {
    edit_identity: { allowed: true, reasons: [] },
    edit_csa: { allowed: true, reasons: [] },
    delete: { allowed: true, reasons: [] },
  },
  translations: [
    {
      locale: "vi",
      name: "Rau muống",
      short_description: "Rau canh tác tự nhiên",
      description: "Mô tả riêng tiếng Việt",
    },
    {
      locale: "en",
      name: "Water spinach",
      short_description: "Naturally farmed",
      description: "English-only description",
    },
  ],
  created_at: "",
  updated_at: "",
};

const fallback = [{ label: "Sản phẩm", href: listPath }, { label: "Chi tiết sản phẩm" }];

function Header() {
  return <AdminHeaderContent items={useAdminBreadcrumbs(fallback)} />;
}

function page() {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <AdminBreadcrumbProvider pathname={pathname} search={mocks.search.toString()}>
        <Header />
        <StoreProductDetail productId={productId} />
      </AdminBreadcrumbProvider>
    </QueryClientProvider>
  );
}

function expectContextualLink(href: string | null, expectedPath: string) {
  const destination = new URL(href ?? "", "https://admin.example.test");
  expect(destination.pathname).toBe(expectedPath);
  expect(Object.fromEntries(destination.searchParams)).toEqual(filters);
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.locale = "vi";
  mocks.search = new URLSearchParams({ ...filters, redirect: "https://example.test" });
  mocks.isCurrent.mockReturnValue(true);
  mocks.load.mockResolvedValue(storedProduct);
});
afterEach(cleanup);

it("owns the breadcrumb and record heading during loading, viewing and permission loss", async () => {
  mocks.transition.mockRejectedValue(Object.assign(new Error("forbidden"), { status: 403 }));
  render(page());
  const breadcrumb = within(screen.getByRole("navigation"));
  expect(breadcrumb.getByText("Chi tiết sản phẩm")).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Chi tiết sản phẩm");
  expect(await screen.findByRole("heading", { level: 1, name: "Rau muống" })).toBeVisible();
  expect(breadcrumb.getByText("Rau muống")).toHaveAttribute("aria-current", "page");
  expect(breadcrumb.queryByRole("link", { name: "Rau muống" })).not.toBeInTheDocument();
  expect(screen.getAllByRole("link", { name: "Sản phẩm" })).toHaveLength(1);
  expectContextualLink(
    breadcrumb.getByRole("link", { name: "Sản phẩm" }).getAttribute("href"),
    listPath,
  );
  expectContextualLink(
    screen.getByRole("link", { name: "Chỉnh sửa" }).getAttribute("href"),
    `${pathname}/edit`,
  );
  expect(mocks.load).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByRole("button", { name: "Đưa lên bán" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Đưa lên bán" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(adminDictionaries.vi.common.forbidden);
  expect(screen.queryByText("Rau muống")).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Chi tiết sản phẩm");
  expect(breadcrumb.getByText("Chi tiết sản phẩm")).toHaveAttribute("aria-current", "page");
});

it("opens the admin language and only mounts the selected description", async () => {
  mocks.locale = "en";
  render(page());
  expect(await screen.findByRole("tab", { name: "English" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(screen.getByText("English-only description")).toBeVisible();
  expect(screen.queryByText("Mô tả riêng tiếng Việt")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", { name: "Tiếng Việt" }));
  expect(screen.getByText("Mô tả riêng tiếng Việt")).toBeVisible();
  expect(screen.queryByText("English-only description")).not.toBeInTheDocument();
});

it("defaults to the available translation and explains an empty tab", async () => {
  mocks.locale = "en";
  mocks.load.mockResolvedValue({ ...storedProduct, translations: [storedProduct.translations[0]] });
  render(page());
  expect(await screen.findByRole("tab", { name: "Tiếng Việt" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(screen.getByText("Mô tả riêng tiếng Việt")).toBeVisible();
  fireEvent.click(screen.getByRole("tab", { name: "English" }));
  expect(screen.getByText(adminDictionaries.en.storeCatalog.productContentMissing)).toBeVisible();
  expect(screen.queryByText("Mô tả riêng tiếng Việt")).not.toBeInTheDocument();
});

it("returns focus to the action menu after cancelling delete", async () => {
  render(page());
  const trigger = await screen.findByRole("button", { name: "Thao tác khác" });
  fireEvent.click(trigger);
  const deleteAction = screen.getByRole("menuitem", { name: "Xóa" });
  deleteAction.focus();
  fireEvent.click(deleteAction);
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Hủy" }));
  await waitFor(() => expect(trigger).toHaveFocus());
  expect(mocks.remove).not.toHaveBeenCalled();
});

it("returns a successful deletion to its filtered list", async () => {
  mocks.remove.mockResolvedValue(undefined);
  render(page());
  fireEvent.click(await screen.findByRole("button", { name: "Thao tác khác" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Xóa" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Xóa" }));
  await waitFor(() => expect(mocks.replace).toHaveBeenCalledTimes(1));
  expectContextualLink(mocks.replace.mock.calls[0][0], listPath);
});
