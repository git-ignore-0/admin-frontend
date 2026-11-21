import type { IconName } from "@/components/nfv-controls";
import type { AdminDictionary } from "@/lib/admin-i18n";

export type AdminNavigationSectionKey =
  "overview" | "store" | "csa" | "farms" | "promotions" | "community" | "website" | "settings";
export type AdminNavigationItem = { href: string; label: string; icon?: IconName };
export type AdminNavigationSection = {
  key: AdminNavigationSectionKey;
  label: string;
  icon: IconName;
  items: readonly AdminNavigationItem[];
};

/** Old overview URLs remain valid; contextual records have a single sidebar owner. */
function navigationPath(pathname: string) {
  if (pathname === "/store-catalog") return "/store-catalog/products";
  if (pathname === "/membership-catalog") return "/membership-catalog/packages";
  if (pathname === "/points" || pathname.startsWith("/points/")) return "/users";
  if (pathname === "/memberships" || pathname.startsWith("/memberships/")) return "/csa-customers";
  return pathname;
}
export function isActiveAdminRoute(pathname: string, href: string) {
  const current = navigationPath(pathname);
  return current === href || current.startsWith(`${href}/`);
}
export function activeAdminSection(pathname: string, sections: readonly AdminNavigationSection[]) {
  return sections.find((section) =>
    section.items.some((item) => isActiveAdminRoute(pathname, item.href)),
  );
}
export function adminNavigation(t: AdminDictionary): readonly AdminNavigationSection[] {
  return [
    {
      key: "overview",
      label: t.common.overviewGroup,
      icon: "dashboard",
      items: [{ href: "/dashboard", label: t.common.dashboard, icon: "dashboard" }],
    },
    {
      key: "store",
      label: t.common.storeCatalog,
      icon: "store",
      items: [
        { href: "/store-orders", label: t.common.storeOrders, icon: "orders" },
        { href: "/store-catalog/products", label: t.storeCatalog.products, icon: "product" },
        { href: "/store-catalog/categories", label: t.storeCatalog.categories, icon: "categories" },
      ],
    },
    {
      key: "csa",
      label: t.common.csa,
      icon: "csa",
      items: [
        { href: "/csa-rounds", label: t.common.csaRounds, icon: "calendar" },
        { href: "/csa-purchase-requests", label: t.common.csaPurchaseRequests, icon: "purchase" },
        { href: "/csa-customers", label: t.common.csaCustomers, icon: "users" },
        {
          href: "/membership-catalog/packages",
          label: t.membershipCatalog.packages,
          icon: "product",
        },
        {
          href: "/membership-catalog/products",
          label: t.membershipCatalog.products,
          icon: "quota",
        },
        { href: "/csa-terms", label: t.common.csaTerms, icon: "terms" },
      ],
    },
    {
      key: "farms",
      label: t.common.farms,
      icon: "farms",
      items: [
        { href: "/farms", label: t.common.farmList, icon: "farms" },
        { href: "/tracker-farms", label: t.common.trackerFarms, icon: "tracker" },
      ],
    },
    {
      key: "promotions",
      label: t.common.promotionsGroup,
      icon: "voucher",
      items: [{ href: "/csa-coupons", label: t.common.csaCoupons, icon: "voucher" }],
    },
    {
      key: "community",
      label: t.common.communityGroup,
      icon: "users",
      items: [
        { href: "/users", label: t.common.users, icon: "users" },
        { href: "/rewards", label: t.common.rewards, icon: "reward" },
        { href: "/redemptions", label: t.common.redemptions, icon: "redemption" },
      ],
    },
    {
      key: "website",
      label: t.common.websiteContentGroup,
      icon: "website",
      items: [
        { href: "/workshops", label: t.common.workshops, icon: "workshop" },
        { href: "/testimonials", label: t.common.testimonials, icon: "users" },
      ],
    },
    {
      key: "settings",
      label: t.common.settingsGroup,
      icon: "settings",
      items: [
        { href: "/shipping-settings", label: t.common.shippingSettings, icon: "shipping" },
        {
          href: "/membership-payment-settings",
          label: t.common.membershipPaymentSettings,
          icon: "payments",
        },
        { href: "/settings", label: t.common.settings, icon: "settings" },
      ],
    },
  ];
}
