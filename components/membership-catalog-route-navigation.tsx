"use client";

import { useSearchParams } from "next/navigation";
import { useMemo } from "react";

import { AdminBreadcrumbForRoute } from "@/components/admin-breadcrumb-context";
import { useAdminI18n } from "@/components/admin-i18n-provider";
import { DetailPageHeading } from "@/components/detail-page-heading";
import { adminNavigation, resolveAdminBreadcrumbs } from "@/lib/admin-navigation";
import {
  catalogHref,
  catalogPath,
  readCatalogListContext,
  withCatalogListContext,
  type CatalogResource,
} from "@/lib/membership-catalog-navigation";

export function MembershipCatalogBreadcrumbs({
  resource,
  id,
  action,
}: {
  resource: CatalogResource;
  id: string;
  action?: "edit";
}) {
  const { t } = useAdminI18n();
  const search = useSearchParams()?.toString();
  const pathname = catalogPath(resource, id, action);
  const listPath = catalogPath(resource);
  const items = useMemo(() => {
    const context = readCatalogListContext(new URLSearchParams(search));
    const catalogItem = adminNavigation(t)
      .find((section) => section.key === "csa")
      ?.items.find((item) => item.href === listPath);
    return resolveAdminBreadcrumbs(pathname, catalogItem, t).map((item) =>
      item.href ? { ...item, href: withCatalogListContext(item.href, context) } : item,
    );
  }, [listPath, pathname, search, t]);

  return <AdminBreadcrumbForRoute pathname={pathname} search={search} items={items} />;
}

export function MembershipCatalogEditorHeading({
  resource,
  id,
}: {
  resource: CatalogResource;
  id?: string;
}) {
  const { t } = useAdminI18n();
  const context = readCatalogListContext(useSearchParams());
  const copy = t.membershipCatalog;
  const labels =
    resource === "products"
      ? {
          backLabel: id ? copy.backToProductDetail : copy.backToProducts,
          description: id ? copy.editProductDescription : copy.newProductDescription,
          title: id ? copy.editProduct : copy.newProduct,
        }
      : {
          backLabel: id ? copy.backToPackageDetail : copy.backToPackages,
          description: id ? copy.editPackageDescription : copy.newPackageDescription,
          title: id ? copy.editPackage : copy.newPackage,
        };

  return (
    <>
      <MembershipCatalogBreadcrumbs
        resource={resource}
        id={id ?? "new"}
        action={id ? "edit" : undefined}
      />
      <DetailPageHeading {...labels} backHref={catalogHref(resource, context, id)} />
    </>
  );
}
