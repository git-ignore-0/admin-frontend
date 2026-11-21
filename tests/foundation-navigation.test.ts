import { describe, expect, it } from "vitest";
import { activeAdminSection, adminNavigation, isActiveAdminRoute } from "@/lib/admin-navigation";
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
