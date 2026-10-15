import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import PackageListPage from "@/app/(admin)/membership-catalog/packages/page";
import ProductListPage from "@/app/(admin)/membership-catalog/products/page";

const adminLocale = vi.hoisted(() => ({ value: "en" as "vi" | "en" }));

vi.mock("@/lib/admin-locale", () => ({
  getAdminLocale: async () => adminLocale.value,
}));
vi.mock("@/components/membership-catalog-lists", () => ({
  MembershipProductList: () => <div>Product list</div>,
  MembershipPackageList: () => <div>Package list</div>,
}));

afterEach(() => {
  cleanup();
  adminLocale.value = "en";
});

describe("CSA catalog list navigation", () => {
  it.each([
    {
      locale: "vi" as const,
      backLabel: "Danh mục CSA",
      productTitle: "Nhóm quota CSA",
      productCreate: "Tạo nhóm quota",
      packageTitle: "Gói CSA",
      packageCreate: "Tạo gói",
    },
    {
      locale: "en" as const,
      backLabel: "CSA catalog",
      productTitle: "CSA quota groups",
      productCreate: "Create quota group",
      packageTitle: "CSA packages",
      packageCreate: "Create package",
    },
  ])(
    "links both $locale list headings back to the catalog overview",
    async ({ locale, backLabel, productTitle, productCreate, packageTitle, packageCreate }) => {
      adminLocale.value = locale;

      const productPage = render(await ProductListPage());
      expect(screen.getByRole("link", { name: backLabel })).toHaveAttribute(
        "href",
        "/membership-catalog",
      );
      expect(screen.getByRole("heading", { name: productTitle })).toBeVisible();
      expect(screen.getByRole("link", { name: new RegExp(productCreate) })).toHaveAttribute(
        "href",
        "/membership-catalog/products/new",
      );
      productPage.unmount();

      render(await PackageListPage());
      expect(screen.getByRole("link", { name: backLabel })).toHaveAttribute(
        "href",
        "/membership-catalog",
      );
      expect(screen.getByRole("heading", { name: packageTitle })).toBeVisible();
      expect(screen.getByRole("link", { name: new RegExp(packageCreate) })).toHaveAttribute(
        "href",
        "/membership-catalog/packages/new",
      );
    },
  );
});
