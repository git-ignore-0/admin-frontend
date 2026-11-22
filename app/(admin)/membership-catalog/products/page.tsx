import { MembershipProductList } from "@/components/membership-catalog-lists";
import { PageHeading } from "@/components/page-heading";
import { adminDictionaries } from "@/lib/admin-i18n";
import { getAdminLocale } from "@/lib/admin-locale";

export async function generateMetadata() {
  const t = adminDictionaries[await getAdminLocale()];
  return { title: t.membershipCatalog.products };
}

export default async function ProductListPage() {
  const t = adminDictionaries[await getAdminLocale()];
  return (
    <>
      <PageHeading title={t.membershipCatalog.products} visuallyHiddenTitle />
      <MembershipProductList />
    </>
  );
}
