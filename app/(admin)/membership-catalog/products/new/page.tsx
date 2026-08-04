import { DetailPageHeading } from "@/components/detail-page-heading";
import { MembershipProductEditor } from "@/components/membership-catalog-editors";
import { adminDictionaries } from "@/lib/admin-i18n";
import { getAdminLocale } from "@/lib/admin-locale";

export default async function NewProductPage() {
  const t = adminDictionaries[await getAdminLocale()];
  return (
    <>
      <DetailPageHeading
        backHref="/membership-catalog/products"
        backLabel={t.membershipCatalog.backToProducts}
        description={t.membershipCatalog.newProductDescription}
        title={t.membershipCatalog.newProduct}
      />
      <MembershipProductEditor />
    </>
  );
}
