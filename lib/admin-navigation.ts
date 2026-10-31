import type { IconName } from "@/components/nfv-controls";
import type { AdminDictionary } from "@/lib/admin-i18n";

export type AdminNavigationSectionKey =
  "main" | "pointsRewards" | "csa" | "store" | "farms" | "website";

export type AdminNavigationItem = {
  href: string;
  label: string;
  icon?: IconName;
};

export type AdminNavigationSection = {
  key: AdminNavigationSectionKey;
  label?: string;
  icon: IconName;
  items: readonly AdminNavigationItem[];
};

export function isActiveAdminRoute(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function activeAdminSection(pathname: string, sections: readonly AdminNavigationSection[]) {
  return sections.find((section) =>
    section.items.some((item) => isActiveAdminRoute(pathname, item.href)),
  );
}

export function adminNavigation(t: AdminDictionary): readonly AdminNavigationSection[] {
  return [
    {
      key: "main",
      icon: "dashboard",
      items: [
        { href: "/dashboard", label: t.common.dashboard, icon: "dashboard" },
        { href: "/users", label: t.common.users, icon: "users" },
      ],
    },
    {
      key: "pointsRewards",
      label: t.common.pointsAndRewards,
      icon: "points",
      items: [
        { href: "/points", label: t.common.managePoints },
        { href: "/rewards", label: t.common.rewards },
        { href: "/redemptions", label: t.common.redemptions },
      ],
    },
    {
      key: "csa",
      label: t.common.csa,
      icon: "csa",
      items: [
        { href: "/csa-customers", label: t.common.csaCustomers },
        { href: "/csa-purchase-requests", label: t.common.csaPurchaseRequests },
        { href: "/csa-coupons", label: t.common.csaCoupons },
        { href: "/csa-terms", label: t.common.csaTerms },
        { href: "/membership-catalog", label: t.common.membershipCatalog },
      ],
    },
    {
      key: "store",
      label: t.common.storeCatalog,
      icon: "store",
      items: [
        { href: "/store-catalog", label: t.storeCatalog.title },
        { href: "/shipping-settings", label: t.common.shippingSettings },
      ],
    },
    {
      key: "farms",
      label: t.common.farms,
      icon: "farms",
      items: [
        { href: "/farms", label: t.common.farmList },
        { href: "/tracker-farms", label: t.common.trackerFarms },
      ],
    },
    {
      key: "website",
      label: t.common.website,
      icon: "website",
      items: [
        { href: "/settings", label: t.common.settings },
        {
          href: "/membership-payment-settings",
          label: t.common.membershipPaymentSettings,
        },
        { href: "/workshops", label: t.common.workshops },
        { href: "/testimonials", label: t.common.testimonials },
      ],
    },
  ];
}
