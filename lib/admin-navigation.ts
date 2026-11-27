import type { IconName } from "@/components/admin-icon";
import type { AdminDictionary } from "@/lib/admin-i18n";

export type AdminNavigationSectionKey =
  "overview" | "store" | "csa" | "farms" | "promotions" | "community" | "website" | "settings";
type ChildScreenLabels = { new?: string; record: string; edit?: string };
export type AdminNavigationItem = {
  href: string;
  label: string;
  icon?: IconName;
  childScreens?: ChildScreenLabels;
};
export type AdminNavigationSection = {
  key: AdminNavigationSectionKey;
  label: string;
  icon: IconName;
  items: readonly AdminNavigationItem[];
};

/** The last item is the current screen. Ancestor hrefs may carry caller-owned list state. */
export type AdminBreadcrumbItem = { label: string; href?: string };

export function isInternalAdminHref(href: string) {
  return href.startsWith("/") && !/^\/(\/|%2f|%5c)/i.test(href) && !/[\\\s\p{Cc}]/u.test(href);
}

function atOrBelow(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Old overview URLs remain valid; contextual records have a single sidebar owner. */
function navigationPath(pathname: string) {
  if (pathname === "/store-catalog") return "/store-catalog/products";
  if (pathname === "/membership-catalog") return "/membership-catalog/packages";
  if (atOrBelow(pathname, "/tracker-farms")) return "/farms";
  if (atOrBelow(pathname, "/points")) return "/users";
  if (atOrBelow(pathname, "/memberships")) return "/csa-customers";
  return pathname;
}
export function isActiveAdminRoute(pathname: string, href: string) {
  return atOrBelow(navigationPath(pathname), href);
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
        {
          href: "/store-orders",
          label: t.common.storeOrders,
          icon: "orders",
          childScreens: { record: t.breadcrumb.orderDetails },
        },
        {
          href: "/store-catalog/products",
          label: t.storeCatalog.products,
          icon: "product",
          childScreens: {
            new: t.storeCatalog.addProduct,
            record: t.breadcrumb.productDetails,
            edit: t.breadcrumb.edit,
          },
        },
        {
          href: "/store-catalog/categories",
          label: t.storeCatalog.categories,
          icon: "categories",
          childScreens: {
            new: t.storeCatalog.addCategory,
            record: t.breadcrumb.categoryDetails,
            edit: t.breadcrumb.edit,
          },
        },
      ],
    },
    {
      key: "farms",
      label: t.common.farms,
      icon: "farms",
      items: [
        {
          href: "/farms",
          label: t.common.farmList,
          icon: "farms",
          childScreens: {
            new: t.breadcrumb.newFarm,
            record: t.breadcrumb.farmDetails,
          },
        },
      ],
    },
    {
      key: "csa",
      label: t.common.csa,
      icon: "csa",
      items: [
        {
          href: "/csa-rounds",
          label: t.common.csaRounds,
          icon: "calendar",
        },
        {
          href: "/csa-purchase-requests",
          label: t.common.csaPurchaseRequests,
          icon: "purchase",
          childScreens: { record: t.csaPurchases.detailTitle },
        },
        {
          href: "/csa-customers",
          label: t.common.csaCustomers,
          icon: "users",
          childScreens: { new: t.csaCustomers.createTitle, record: t.csaCustomers.profile },
        },
        {
          href: "/membership-catalog/packages",
          label: t.membershipCatalog.packages,
          icon: "product",
          childScreens: {
            new: t.membershipCatalog.newPackage,
            record: t.membershipCatalog.backToPackageDetail,
            edit: t.breadcrumb.edit,
          },
        },
        {
          href: "/membership-catalog/products",
          label: t.membershipCatalog.products,
          icon: "quota",
          childScreens: {
            new: t.membershipCatalog.newProduct,
            record: t.membershipCatalog.backToProductDetail,
            edit: t.breadcrumb.edit,
          },
        },
        {
          href: "/csa-terms",
          label: t.common.csaTerms,
          icon: "terms",
          childScreens: { new: t.csaTerms.createTitle, record: t.csaTerms.viewTitle },
        },
      ],
    },
    {
      key: "promotions",
      label: t.common.promotionsGroup,
      icon: "voucher",
      items: [
        {
          href: "/csa-coupons",
          label: t.common.csaCoupons,
          icon: "voucher",
          childScreens: { new: t.csaCoupons.createTitle, record: t.csaCoupons.editTitle },
        },
      ],
    },
    {
      key: "community",
      label: t.common.communityGroup,
      icon: "users",
      items: [
        {
          href: "/users",
          label: t.common.users,
          icon: "users",
          childScreens: { record: t.users.detailTitle },
        },
        {
          href: "/rewards",
          label: t.common.rewards,
          icon: "reward",
          childScreens: { new: t.rewards.newTitle, record: t.rewards.editTitle },
        },
        {
          href: "/redemptions",
          label: t.common.redemptions,
          icon: "redemption",
          childScreens: { record: t.redemptions.detailTitle },
        },
      ],
    },
    {
      key: "website",
      label: t.common.websiteContentGroup,
      icon: "website",
      items: [
        {
          href: "/workshops",
          label: t.common.workshops,
          icon: "workshop",
          childScreens: { new: t.page.newWorkshop, record: t.page.editWorkshop },
        },
        {
          href: "/testimonials",
          label: t.common.testimonials,
          icon: "users",
          childScreens: {
            new: t.testimonials.newTitle,
            record: t.testimonials.detailTitle,
            edit: t.breadcrumb.edit,
          },
        },
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

export function resolveAdminBreadcrumbs(
  pathname: string,
  activeItem: AdminNavigationItem | undefined,
  t: AdminDictionary,
): readonly AdminBreadcrumbItem[] {
  if (!activeItem) {
    return process.env.NODE_ENV !== "production" && atOrBelow(pathname, "/dev/ui-foundation")
      ? [{ label: t.breadcrumb.uiFoundation }]
      : [];
  }

  const root = { label: activeItem.label, href: activeItem.href };
  const [list, record] = pathname.slice(1).split("/");
  if (list === "points" && activeItem.href === "/users") {
    const points = { label: t.common.points, href: "/points" };
    if (pathname === "/points") return [root, { label: points.label }];
    if (record && pathname === `/points/${record}`) {
      return [root, points, { label: t.points.detailTitle }];
    }
  }
  if (list === "memberships" && activeItem.href === "/csa-customers") {
    if (record && pathname === `/memberships/${record}`) {
      const label =
        record === "assign" ? t.memberships.assignmentTitle : t.breadcrumb.membershipDetails;
      return [root, { label }];
    }
  }
  if (activeItem.href === "/csa-rounds") {
    if (pathname === "/csa-rounds/new") return [root, { label: t.breadcrumb.newCsaConfiguration }];
    if (/^\/csa-rounds\/[^/]+\/edit$/.test(pathname)) {
      return [root, { label: t.breadcrumb.editCsaRound }];
    }
    return [root];
  }

  const labels = activeItem.childScreens;
  if (labels && pathname.startsWith(`${activeItem.href}/`)) {
    const [id, action, extra] = pathname.slice(activeItem.href.length + 1).split("/");
    if (
      activeItem.href === "/farms" &&
      id &&
      action === "stock-batches" &&
      extra === "new" &&
      pathname === `/farms/${id}/stock-batches/new` &&
      isInternalAdminHref(`/farms/${id}`)
    ) {
      return [root, { label: labels.record, href: `/farms/${id}` }];
    }
    if (
      activeItem.href === "/farms" &&
      id &&
      extra &&
      action === "products" &&
      pathname === `/farms/${id}/products/${extra}` &&
      isInternalAdminHref(`/farms/${id}`)
    ) {
      return [
        root,
        { label: labels.record, href: `/farms/${id}` },
        { label: t.breadcrumb.productDetails },
      ];
    }
    if (id && extra === undefined) {
      const createLabel = id === "new" ? labels.new : undefined;
      if (action === undefined) return [root, { label: createLabel ?? labels.record }];
      if (!createLabel && activeItem.href === "/farms" && action === "edit") {
        return [root, { label: labels.record }];
      }
      if (!createLabel && action === "edit" && labels.edit) {
        const href = `${activeItem.href}/${id}`;
        if (isInternalAdminHref(href)) {
          return [root, { label: labels.record, href }, { label: labels.edit }];
        }
      }
    }
  }

  return [{ label: activeItem.label }];
}
