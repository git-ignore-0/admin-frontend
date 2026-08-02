"use client";

import Link from "next/link";

import { useAdminI18n } from "@/components/admin-i18n-provider";

export function MembershipCatalogOverview() {
  const { t } = useAdminI18n();
  return (
    <div className="catalog-overview-grid">
      <section className="panel catalog-overview-card">
        <div>
          <h2>{t.membershipCatalog.products}</h2>
          <p>{t.membershipCatalog.productsOverview}</p>
        </div>
        <Link className="button" href="/membership-catalog/products">
          {t.membershipCatalog.manageProducts}
        </Link>
      </section>
      <section className="panel catalog-overview-card">
        <div>
          <h2>{t.membershipCatalog.packages}</h2>
          <p>{t.membershipCatalog.packagesOverview}</p>
        </div>
        <Link className="button" href="/membership-catalog/packages">
          {t.membershipCatalog.managePackages}
        </Link>
      </section>
    </div>
  );
}
