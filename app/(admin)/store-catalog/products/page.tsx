import Link from "next/link";

import { PageHeading } from "@/components/page-heading";
import { StoreProductList } from "@/components/store-product-list";
import { adminDictionaries } from "@/lib/admin-i18n";
import { getAdminLocale } from "@/lib/admin-locale";

export default async function StoreProductsPage() {
  const t = adminDictionaries[await getAdminLocale()].storeCatalog;
  return (
    <>
      <PageHeading
        title={t.products}
        description={t.productsDescription}
        backHref="/store-catalog"
        backLabel={t.title}
        action={
          <Link className="button" href="/store-catalog/products/new">
            {t.addProduct}
          </Link>
        }
      />
      <StoreProductList />
    </>
  );
}
