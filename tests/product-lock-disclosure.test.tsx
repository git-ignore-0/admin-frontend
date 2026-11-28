import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { ProductLockDisclosure } from "@/components/product-lifecycle-status";
import { adminDictionaries } from "@/lib/admin-i18n";
import type { ProductLockReason } from "@/lib/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

afterEach(cleanup);

const farmId = "21b625fc-a80a-407b-93fd-c0b2fd79b02e";
const orderId = "55836419-f2eb-49c0-b457-809b8ab9504b";
const roundId = "519c1a85-4973-43f9-8ed1-4586ad9749f3";

const reasons: ProductLockReason[] = [
  {
    code: "stock_batch",
    farm_id: farmId,
    farm_name_vi: "Trang trại Xanh",
    farm_name_en: "Green Farm",
  },
  { code: "store_order", id: orderId, label: "NFV-01" },
  { code: "csa_hold", id: roundId, label: "CSA 01" },
];

it.each([
  {
    locale: "vi",
    summary: "Không thể thay đổi mã SKU và đơn vị bán",
    show: "Xem lý do",
    hide: "Ẩn lý do",
    farmName: "Trang trại Xanh",
    stockBatch: "Đợt hàng",
  },
  {
    locale: "en",
    summary: "The SKU and selling unit can’t be changed",
    show: "View reasons",
    hide: "Hide reasons",
    farmName: "Green Farm",
    stockBatch: "Stock batch",
  },
] as const)("discloses the exact lock reasons and links in $locale", (copy) => {
  const submit = vi.fn((event: React.FormEvent) => event.preventDefault());
  render(
    <AdminI18nProvider initialLocale={copy.locale}>
      <form onSubmit={submit}>
        <ProductLockDisclosure
          summary={adminDictionaries[copy.locale].storeCatalog.productLocked}
          reasons={reasons}
        />
      </form>
    </AdminI18nProvider>,
  );

  expect(screen.getByText(copy.summary)).toBeVisible();
  const trigger = screen.getByRole("button", { name: copy.show });
  expect(trigger).toHaveAccessibleDescription(copy.summary);
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  expect(trigger).toHaveAttribute("type", "button");
  expect(document.getElementById(trigger.getAttribute("aria-controls")!)).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: copy.farmName })).not.toBeInTheDocument();

  trigger.focus();
  fireEvent.click(trigger);
  expect(submit).not.toHaveBeenCalled();
  expect(trigger).toHaveFocus();
  expect(trigger).toHaveAccessibleName(copy.hide);
  expect(trigger).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("list")).toHaveTextContent(copy.stockBatch);
  expect(screen.getByRole("link", { name: copy.farmName })).toHaveAttribute(
    "href",
    `/farms/${farmId}`,
  );
  expect(screen.getByRole("link", { name: "NFV-01" })).toHaveAttribute(
    "href",
    `/store-orders/${orderId}`,
  );
  expect(screen.getByRole("link", { name: "CSA 01" })).toHaveAttribute(
    "href",
    `/csa-rounds/${roundId}`,
  );

  fireEvent.click(trigger);
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
});

it("keeps the summary visible when there are no reference details to disclose", () => {
  render(
    <AdminI18nProvider initialLocale="vi">
      <ProductLockDisclosure summary="Không thể xóa sản phẩm" reasons={[]} />
    </AdminI18nProvider>,
  );

  expect(screen.getByText("Không thể xóa sản phẩm")).toBeVisible();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
