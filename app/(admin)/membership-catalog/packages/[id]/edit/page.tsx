import { DetailPageHeading } from "@/components/detail-page-heading";
import { MembershipPackageEditor } from "@/components/membership-catalog-editors";
import { adminDictionaries } from "@/lib/admin-i18n";
import { getAdminLocale } from "@/lib/admin-locale";

export default async function PackageEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = adminDictionaries[await getAdminLocale()];
  return (
    <>
      <DetailPageHeading
        backHref={`/membership-catalog/packages/${id}`}
        backLabel={t.membershipCatalog.backToPackageDetail}
        description={t.membershipCatalog.editPackageDescription}
        title={t.membershipCatalog.editPackage}
      />
      <MembershipPackageEditor packageId={id} />
    </>
  );
}
