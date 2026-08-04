import { MembershipAssignmentForm } from "@/components/membership-assignment-form";
import { DetailPageHeading } from "@/components/detail-page-heading";
import { adminDictionaries } from "@/lib/admin-i18n";
import { getAdminLocale } from "@/lib/admin-locale";

export default async function AssignMembershipPage() {
  const t = adminDictionaries[await getAdminLocale()];
  return (
    <>
      <DetailPageHeading
        backHref="/memberships"
        backLabel={t.memberships.backLabel}
        description={t.memberships.assignmentDescription}
        title={t.memberships.assignmentTitle}
      />
      <MembershipAssignmentForm />
    </>
  );
}
