import Link from "next/link";

import { PageHeading } from "@/components/page-heading";
import { adminDictionaries } from "@/lib/admin-i18n";
import { getAdminLocale } from "@/lib/admin-locale";

export default async function StoreCatalogPage() {
  const t = adminDictionaries[await getAdminLocale()].storeCatalog;
  return (
    <>
      <PageHeading title={t.title} description={t.description} />
      <div className="dashboard-grid">
        <section className="panel">
          <h2>{t.categories}</h2>
          <p>{t.categoriesDescription}</p>
          <Link className="button" href="/store-catalog/categories">
            {t.categories}
          </Link>
        </section>
        <section className="panel">
          <h2>{t.products}</h2>
          <p>{t.productsDescription}</p>
          <Link className="button" href="/store-catalog/products">
            {t.products}
          </Link>
        </section>
      </div>
    </>
  );
}
