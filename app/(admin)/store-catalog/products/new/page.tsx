import { PageHeading } from "@/components/page-heading";
import { StoreProductEditor } from "@/components/store-product-editor";
import { adminDictionaries } from "@/lib/admin-i18n";
import { getAdminLocale } from "@/lib/admin-locale";

export default async function NewStoreProductPage() {
  const t = adminDictionaries[await getAdminLocale()].storeCatalog;
  return (
    <>
      <PageHeading title={t.addProduct} backHref="/store-catalog/products" backLabel={t.products} />
      <StoreProductEditor />
    </>
  );
}
