import { PageHeading } from "@/components/page-heading";
import { StoreProductEditor } from "@/components/store-product-editor";
import { adminDictionaries } from "@/lib/admin-i18n";
import { getAdminLocale } from "@/lib/admin-locale";

export default async function EditStoreProductPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  const t = adminDictionaries[await getAdminLocale()].storeCatalog;
  return (
    <>
      <PageHeading
        title={t.edit}
        backHref={`/store-catalog/products/${productId}`}
        backLabel={t.products}
      />
      <StoreProductEditor productId={productId} />
    </>
  );
}
