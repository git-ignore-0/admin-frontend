import Link from "next/link";

import { MembershipList } from "@/components/membership-list";
import { PageHeading } from "@/components/page-heading";
import { adminDictionaries } from "@/lib/admin-i18n";
import { getAdminLocale } from "@/lib/admin-locale";

export async function generateMetadata() {
  const t = adminDictionaries[await getAdminLocale()];
  return { title: t.common.memberships };
}
export default async function MembershipsPage() {
  const t = adminDictionaries[await getAdminLocale()];
  return (
    <>
      <PageHeading
        action={
          <Link className="button" href="/memberships/assign">
            {t.memberships.assign}
          </Link>
        }
        description={t.page.membershipsDescription}
        title={t.common.memberships}
      />
      <MembershipList />
    </>
  );
}
