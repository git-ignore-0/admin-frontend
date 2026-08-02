import { DetailPageHeading } from "@/components/detail-page-heading";
import { MembershipProductEditor } from "@/components/membership-catalog-editors";
import { adminDictionaries } from "@/lib/admin-i18n";
import { getAdminLocale } from "@/lib/admin-locale";

export default async function ProductEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = adminDictionaries[await getAdminLocale()];
  return (
    <>
      <DetailPageHeading
        backHref={`/membership-catalog/products/${id}`}
        backLabel={t.membershipCatalog.backToProductDetail}
        description={t.membershipCatalog.editProductDescription}
        title={t.membershipCatalog.editProduct}
      />
      <MembershipProductEditor productId={id} />
    </>
  );
}
