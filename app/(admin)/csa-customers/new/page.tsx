import { CSACustomerForm } from "@/components/csa-customer-form";
import { DetailPageHeading } from "@/components/detail-page-heading";
import { adminDictionaries } from "@/lib/admin-i18n";
import { getAdminLocale } from "@/lib/admin-locale";
export default async function Page() {
  const t = adminDictionaries[await getAdminLocale()];
  return (
    <>
      <DetailPageHeading
        backHref="/csa-customers"
        backLabel={t.csaCustomers.back}
        title={t.csaCustomers.createTitle}
        description={t.csaCustomers.createDescription}
      />
      <CSACustomerForm />
    </>
  );
}
