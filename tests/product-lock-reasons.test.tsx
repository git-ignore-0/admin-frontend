import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { ProductLockReasons } from "@/components/product-lifecycle-status";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

afterEach(cleanup);
const id = "24803641-2dce-4cac-8fc4-91e55f03e95f";

it.each([
  ["vi", "Vườn"],
  ["en", "Farm"],
] as const)("links localized references in %s", (locale, name) => {
  render(
    <AdminI18nProvider initialLocale={locale}>
      <ProductLockReasons
        reasons={[
          { code: "stock_batch", farm_id: id, farm_name_vi: "Vườn", farm_name_en: "Farm" },
          { code: "legacy_supply", farm_id: id, farm_name_vi: "Vườn cũ", farm_name_en: "Old farm" },
          {
            code: "farm_link",
            farm_id: id,
            farm_name_vi: "Vườn liên kết",
            farm_name_en: "Linked farm",
          },
          { code: "store_order", id, label: "DH-101" },
          { code: "store_reservation", id, label: "DH-102" },
          { code: "csa_history", id, label: "CSA June" },
          { code: "csa_hold", id: "not-an-id", label: "Đợt không có ID" },
        ]}
      />
    </AdminI18nProvider>,
  );
  expect(screen.getByRole("link", { name })).toHaveAttribute("href", `/farms/${id}`);
  expect(
    screen.getByRole("link", { name: locale === "vi" ? "Vườn cũ" : "Old farm" }),
  ).toHaveAttribute("href", `/farms/${id}`);
  expect(
    screen.getByRole("link", { name: locale === "vi" ? "Vườn liên kết" : "Linked farm" }),
  ).toHaveAttribute("href", `/farms/${id}`);
  for (const code of ["DH-101", "DH-102"])
    expect(screen.getByRole("link", { name: code })).toHaveAttribute("href", `/store-orders/${id}`);
  expect(screen.getByRole("link", { name: "CSA June" })).toHaveAttribute(
    "href",
    `/csa-rounds/${id}`,
  );
  expect(screen.getByText("Đợt không có ID")).toBeVisible();
  expect(screen.queryByRole("link", { name: "Đợt không có ID" })).not.toBeInTheDocument();
  expect(screen.queryByText(id)).not.toBeInTheDocument();
});
