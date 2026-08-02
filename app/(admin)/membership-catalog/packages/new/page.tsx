import { DetailPageHeading } from "@/components/detail-page-heading";
import { MembershipPackageEditor } from "@/components/membership-catalog-editors";
import { adminDictionaries } from "@/lib/admin-i18n";
import { getAdminLocale } from "@/lib/admin-locale";

export default async function NewPackagePage() {
  const t = adminDictionaries[await getAdminLocale()];
  return (
    <>
      <DetailPageHeading backHref="/membership-catalog/packages" backLabel={t.membershipCatalog.backToPackages} description={t.membershipCatalog.newPackageDescription} title={t.membershipCatalog.newPackage} />
      <MembershipPackageEditor />
    </>
  );
}
