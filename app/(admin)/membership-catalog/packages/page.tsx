import Link from "next/link";

import { MembershipPackageList } from "@/components/membership-catalog-lists";
import { PageHeading } from "@/components/page-heading";
import { adminDictionaries } from "@/lib/admin-i18n";
import { getAdminLocale } from "@/lib/admin-locale";

export default async function PackageListPage() {
  const t = adminDictionaries[await getAdminLocale()];
  return (
    <>
      <PageHeading
        action={
          <Link className="button" href="/membership-catalog/packages/new">
            {t.membershipCatalog.addPackage}
          </Link>
        }
        backHref="/membership-catalog"
        backLabel={t.membershipCatalog.catalogTitle}
        description={t.page.membershipPackagesDescription}
        title={t.membershipCatalog.packages}
      />
      <MembershipPackageList />
    </>
  );
}
