import { MembershipAssignmentForm } from "@/components/membership-assignment-form";
import { DetailPageHeading } from "@/components/detail-page-heading";
import { adminDictionaries } from "@/lib/admin-i18n";
import { getAdminLocale } from "@/lib/admin-locale";
import { csaCustomerHref, readCsaCustomerListContext } from "@/lib/csa-customers-query";

export async function generateMetadata() {
  const t = adminDictionaries[await getAdminLocale()];
  return { title: t.memberships.assignmentTitle };
}

export default async function AssignMembershipPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = adminDictionaries[await getAdminLocale()];
  const query = await searchParams;
  const customerId = typeof query.customerId === "string" ? query.customerId : undefined;
  const context = readCsaCustomerListContext({
    get: (name) => (typeof query[name] === "string" ? query[name] : null),
  });
  const listHref = csaCustomerHref(context);
  const backHref = csaCustomerHref(context, customerId);
  return (
    <>
      <DetailPageHeading
        backHref={backHref}
        backLabel={customerId ? t.memberships.backToCustomer : t.csaCustomers.back}
        description={t.memberships.assignmentDescription}
        title={t.memberships.assignmentTitle}
      />
      <MembershipAssignmentForm customerId={customerId} backHref={backHref} listHref={listHref} />
    </>
  );
}
