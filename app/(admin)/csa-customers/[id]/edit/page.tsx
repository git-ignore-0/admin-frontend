import { CSACustomerForm } from "@/components/csa-customer-form";
import { DetailPageHeading } from "@/components/detail-page-heading";
import { adminDictionaries } from "@/lib/admin-i18n";
import { getAdminLocale } from "@/lib/admin-locale";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = adminDictionaries[await getAdminLocale()];
  return (
    <>
      <DetailPageHeading
        backHref={`/csa-customers/${id}`}
        backLabel={t.csaCustomers.back}
        title={t.csaCustomers.editTitle}
        description={t.csaCustomers.editDescription}
      />
      <CSACustomerForm customerId={id} />
    </>
  );
}
