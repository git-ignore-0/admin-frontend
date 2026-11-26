import { describe, expect, it, vi } from "vitest";
import {
  activeAdminSection,
  adminNavigation,
  isActiveAdminRoute,
  isInternalAdminHref,
  resolveAdminBreadcrumbs,
} from "@/lib/admin-navigation";
import { adminDictionaries } from "@/lib/admin-i18n";

describe("foundation contextual navigation", () => {
  const sections = adminNavigation(adminDictionaries.en);
  it.each([
    ["/points", "/users", "community"],
    ["/points/a-user", "/users", "community"],
    ["/memberships/assign", "/csa-customers", "csa"],
    ["/memberships/a-membership", "/csa-customers", "csa"],
    ["/store-catalog/products/new", "/store-catalog/products", "store"],
    ["/store-catalog/categories/a/edit", "/store-catalog/categories", "store"],
    ["/store-catalog", "/store-catalog/products", "store"],
    ["/membership-catalog", "/membership-catalog/packages", "csa"],
    ["/membership-catalog/products/a/edit", "/membership-catalog/products", "csa"],
    ["/csa-rounds/a/edit", "/csa-rounds", "csa"],
    ["/csa-coupons/a", "/csa-coupons", "promotions"],
    ["/farms/farm-1/products/product-1", "/farms", "farms"],
  ])("maps %s to exactly one owning item", (path, href, group) => {
    const active = sections
      .flatMap((section) => section.items)
      .filter((item) => isActiveAdminRoute(path, item.href));
    expect(active.map((item) => item.href)).toEqual([href]);
    expect(activeAdminSection(path, sections)?.key).toBe(group);
  });
  it("does not confuse unrelated paths with a nested record", () => {
    expect(isActiveAdminRoute("/users-other", "/users")).toBe(false);
  });
});

describe("foundation breadcrumbs", () => {
  function breadcrumbs(pathname: string, locale: "en" | "vi" = "en") {
    const t = adminDictionaries[locale];
    const activeItem = activeAdminSection(pathname, adminNavigation(t))?.items.find((item) =>
      isActiveAdminRoute(pathname, item.href),
    );
    return resolveAdminBreadcrumbs(pathname, activeItem, t);
  }

  it.each([
    ["/dashboard", "Overview"],
    ["/users", "Users"],
    ["/store-catalog", "Products"],
    ["/membership-catalog", "CSA packages"],
    ["/memberships", "CSA customers"],
  ])("renders the active navigation label without a self link for %s", (pathname, label) => {
    expect(breadcrumbs(pathname)).toEqual([{ label }]);
  });

  it("uses localized record fallbacks for direct child entries", () => {
    expect(breadcrumbs("/users/record-uuid", "vi")).toEqual([
      { label: "Người dùng", href: "/users" },
      { label: "Chi tiết người dùng" },
    ]);
    expect(breadcrumbs("/memberships/record-uuid")).toEqual([
      { label: "CSA customers", href: "/csa-customers" },
      { label: "CSA membership details" },
    ]);
  });

  it("preserves the Points list ancestor alongside its Users sidebar owner", () => {
    expect(breadcrumbs("/points/record-uuid")).toEqual([
      { label: "Users", href: "/users" },
      { label: "Points", href: "/points" },
      { label: "Point details" },
    ]);
  });

  it("keeps a real Farm ancestor for a direct source route fallback", () => {
    expect(breadcrumbs("/farms/farm-1/products/product-1", "vi")).toEqual([
      { label: "Danh sách trang trại", href: "/farms" },
      { label: "Chi tiết trang trại", href: "/farms/farm-1" },
      { label: "Chi tiết sản phẩm" },
    ]);
  });

  it("shows the CSA configuration list while a record name is loading", () => {
    expect(breadcrumbs("/csa-rounds/configurations/record-uuid", "vi")).toEqual([
      { label: "Cấu hình đợt CSA", href: "/csa-rounds" },
    ]);
    expect(breadcrumbs("/csa-rounds/record-uuid", "vi")).toEqual([
      { label: "Cấu hình đợt CSA", href: "/csa-rounds" },
    ]);
    expect(breadcrumbs("/csa-rounds/new", "vi")).toEqual([
      { label: "Cấu hình đợt CSA", href: "/csa-rounds" },
      { label: "Tạo cấu hình" },
    ]);
  });

  it("links to the real record detail from a directly entered edit screen", () => {
    expect(breadcrumbs("/store-catalog/products/record-uuid/edit", "vi")).toEqual([
      { label: "Sản phẩm", href: "/store-catalog/products" },
      { label: "Chi tiết sản phẩm", href: "/store-catalog/products/record-uuid" },
      { label: "Chỉnh sửa" },
    ]);
    expect(breadcrumbs("/store-catalog/products/new", "vi")).toEqual([
      { label: "Sản phẩm", href: "/store-catalog/products" },
      { label: "Thêm sản phẩm" },
    ]);
  });

  it("uses the owning label for unrecognized descendants without deriving labels or links", () => {
    expect(breadcrumbs("/users/a/unsupported/child")).toEqual([{ label: "Users" }]);
    expect(breadcrumbs("/store-catalog/products/new/edit")).toEqual([{ label: "Products" }]);
    expect(breadcrumbs("/unknown")).toEqual([]);
  });

  it("offers the Showcase fallback only outside production without a sidebar entry", () => {
    expect(breadcrumbs("/dev/ui-foundation", "vi")).toEqual([{ label: "Nền tảng giao diện" }]);
    expect(breadcrumbs("/dev/ui-foundation/sample-child")).toEqual([{ label: "UI Foundation" }]);
    expect(breadcrumbs("/dev/ui-foundation-other")).toEqual([]);
    expect(
      activeAdminSection("/dev/ui-foundation", adminNavigation(adminDictionaries.vi)),
    ).toBeUndefined();

    vi.stubEnv("NODE_ENV", "production");
    try {
      expect(breadcrumbs("/dev/ui-foundation")).toEqual([]);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("permits internal list destinations with query state", () => {
    expect(isInternalAdminHref("/users?q=An+Nguyễn&page=2#results")).toBe(true);
  });

  it.each([
    "users",
    "#results",
    "https://example.com/users",
    "//example.com/users",
    "/\\example.com/users",
    "/%2fexample.com/users",
    "/\n/example.com/users",
  ])("rejects unsafe or unqualified ancestor destinations (%s)", (href) => {
    expect(isInternalAdminHref(href)).toBe(false);
  });
});
