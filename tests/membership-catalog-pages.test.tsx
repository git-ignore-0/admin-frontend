import { cleanup, render, screen } from "@testing-library/react";
import { getURLFromRedirectError } from "next/dist/client/components/redirect";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { afterEach, describe, expect, it, vi } from "vitest";

import PackageListPage, {
  generateMetadata as packageMetadata,
} from "@/app/(admin)/membership-catalog/packages/page";
import MembershipCatalogPage from "@/app/(admin)/membership-catalog/page";
import ProductListPage, {
  generateMetadata as productMetadata,
} from "@/app/(admin)/membership-catalog/products/page";

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
  it("redirects the obsolete catalog overview to the package list", async () => {
    try {
      await MembershipCatalogPage();
      expect.unreachable("Expected the old catalog route to redirect");
    } catch (error) {
      if (!isRedirectError(error)) throw error;
      expect(getURLFromRedirectError(error)).toBe("/membership-catalog/packages");
    }
  });

  it.each([
    { locale: "vi" as const, productTitle: "Nhóm quota CSA", packageTitle: "Gói CSA" },
    { locale: "en" as const, productTitle: "CSA quota groups", packageTitle: "CSA packages" },
  ])(
    "keeps accessible $locale list titles without an in-page catalog header",
    async ({ locale, productTitle, packageTitle }) => {
      adminLocale.value = locale;

      const productPage = render(await ProductListPage());
      expect(screen.getByRole("heading", { level: 1, name: productTitle })).toHaveClass(
        "mantine-VisuallyHidden-root",
      );
      expect(screen.getByText("Product list")).toBeInTheDocument();
      expect(screen.queryByRole("banner")).not.toBeInTheDocument();
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
      productPage.unmount();

      render(await PackageListPage());
      expect(screen.getByRole("heading", { level: 1, name: packageTitle })).toHaveClass(
        "mantine-VisuallyHidden-root",
      );
      expect(screen.getByText("Package list")).toBeInTheDocument();
      expect(screen.queryByRole("banner")).not.toBeInTheDocument();
      expect(screen.queryByRole("link")).not.toBeInTheDocument();

      await expect(productMetadata()).resolves.toMatchObject({ title: productTitle });
      await expect(packageMetadata()).resolves.toMatchObject({ title: packageTitle });
    },
  );
});
