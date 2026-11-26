"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useMemo } from "react";

import AdminRouteLoading from "../loading";
import { AdminBreadcrumbForRoute } from "@/components/admin-breadcrumb-context";
import { useAdminI18n } from "@/components/admin-i18n-provider";
import { PageHeading } from "@/components/page-heading";
import { adminNavigation, resolveAdminBreadcrumbs } from "@/lib/admin-navigation";
import { FARM_LIST_PATH, farmHref } from "@/lib/farm-navigation";

export default function FarmRouteLoading() {
  const { t } = useAdminI18n();
  const pathname = usePathname();
  const search = useSearchParams();
  const parent = farmHref(search);
  const recordId = pathname.startsWith(`${FARM_LIST_PATH}/`)
    ? pathname.slice(FARM_LIST_PATH.length + 1).split("/")[0]
    : "";
  const record = recordId ? farmHref(search, { id: recordId }) : FARM_LIST_PATH;
  const items = useMemo(() => {
    const farm = adminNavigation(t).find((section) => section.key === "farms")?.items[0];
    return resolveAdminBreadcrumbs(pathname, farm, t).map((item) =>
      item.href ? { ...item, href: item.href === FARM_LIST_PATH ? parent : record } : item,
    );
  }, [parent, pathname, record, t]);
  return (
    <>
      <AdminBreadcrumbForRoute
        pathname={pathname}
        search={search?.toString() ?? ""}
        items={items}
      />
      <PageHeading title={items.at(-1)?.label ?? t.common.farmList} visuallyHiddenTitle />
      <AdminRouteLoading />
    </>
  );
}
