import { MembershipPackageList } from "@/components/membership-catalog-lists";
import { PageHeading } from "@/components/page-heading";
import { adminDictionaries } from "@/lib/admin-i18n";
import { getAdminLocale } from "@/lib/admin-locale";

export async function generateMetadata() {
  const t = adminDictionaries[await getAdminLocale()];
  return { title: t.membershipCatalog.packages };
}

export default async function PackageListPage() {
  const t = adminDictionaries[await getAdminLocale()];
  return (
    <>
      <PageHeading title={t.membershipCatalog.packages} visuallyHiddenTitle />
      <MembershipPackageList />
    </>
  );
}
