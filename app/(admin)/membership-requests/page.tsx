import { MembershipRequestList } from "@/components/membership-request-list";
import { PageHeading } from "@/components/page-heading";
import { adminDictionaries } from "@/lib/admin-i18n";
import { getAdminLocale } from "@/lib/admin-locale";

export async function generateMetadata() {
  const t = adminDictionaries[await getAdminLocale()];
  return { title: t.common.membershipRequests };
}
export default async function MembershipRequestsPage() {
  const t = adminDictionaries[await getAdminLocale()];
  return (
    <>
      <PageHeading
        description={t.page.membershipRequestsDescription}
        title={t.common.membershipRequests}
      />
      <MembershipRequestList />
    </>
  );
}
