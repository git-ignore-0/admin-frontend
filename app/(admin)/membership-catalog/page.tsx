import { MembershipCatalogOverview } from "@/components/membership-catalog-overview";
import { PageHeading } from "@/components/page-heading";
import { adminDictionaries } from "@/lib/admin-i18n";
import { getAdminLocale } from "@/lib/admin-locale";

export async function generateMetadata() {
  const t = adminDictionaries[await getAdminLocale()];
  return { title: t.membershipCatalog.catalogTitle };
}

export default async function MembershipCatalogPage() {
  const t = adminDictionaries[await getAdminLocale()];
  return (
    <>
      <PageHeading
        description={t.membershipCatalog.catalogDescription}
        title={t.membershipCatalog.catalogTitle}
      />
      <MembershipCatalogOverview />
    </>
  );
}
