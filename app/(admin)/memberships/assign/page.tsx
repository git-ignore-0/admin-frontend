import { MembershipAssignmentForm } from "@/components/membership-assignment-form";
import { DetailPageHeading } from "@/components/detail-page-heading";
import { adminDictionaries } from "@/lib/admin-i18n";
import { getAdminLocale } from "@/lib/admin-locale";

export default async function AssignMembershipPage({
  searchParams,
}: {
  searchParams: Promise<{ customerId?: string | string[] }>;
}) {
  const t = adminDictionaries[await getAdminLocale()];
  const rawCustomerId = (await searchParams).customerId;
  const customerId = typeof rawCustomerId === "string" ? rawCustomerId : undefined;
  return (
    <>
      <DetailPageHeading
        backHref={
          customerId ? `/csa-customers/${encodeURIComponent(customerId)}` : "/csa-customers"
        }
        backLabel={customerId ? t.memberships.backToCustomer : t.csaCustomers.back}
        description={t.memberships.assignmentDescription}
        title={t.memberships.assignmentTitle}
      />
      <MembershipAssignmentForm customerId={customerId} />
    </>
  );
}
