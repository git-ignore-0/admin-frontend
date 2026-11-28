"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useMemo } from "react";

import AdminRouteLoading from "../../loading";
import { AdminBreadcrumbForRoute } from "@/components/admin-breadcrumb-context";
import { useAdminI18n } from "@/components/admin-i18n-provider";
import { PageHeading } from "@/components/page-heading";
import { adminNavigation, resolveAdminBreadcrumbs } from "@/lib/admin-navigation";
import { STORE_PRODUCTS_PATH, storeProductHref } from "@/lib/store-product-navigation";

export default function ProductRouteLoading() {
  const { t } = useAdminI18n();
  const pathname = usePathname();
  const search = useSearchParams();
  const listSearch = storeProductHref(search).slice(STORE_PRODUCTS_PATH.length);
  const items = useMemo(() => {
    const productItem = adminNavigation(t)
      .find((section) => section.key === "store")
      ?.items.find((item) => item.href === STORE_PRODUCTS_PATH);
    return resolveAdminBreadcrumbs(pathname, productItem, t).map((item) =>
      item.href && listSearch ? { ...item, href: `${item.href}${listSearch}` } : item,
    );
  }, [listSearch, pathname, t]);

  return (
    <>
      <AdminBreadcrumbForRoute pathname={pathname} search={search?.toString()} items={items} />
      <PageHeading title={items.at(-1)?.label ?? t.storeCatalog.products} visuallyHiddenTitle />
      <AdminRouteLoading />
    </>
  );
}
