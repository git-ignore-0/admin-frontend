import Link from "next/link";
import { CSACustomerList } from "@/components/csa-customer-list";
import { PageHeading } from "@/components/page-heading";
import { adminDictionaries } from "@/lib/admin-i18n";
import { getAdminLocale } from "@/lib/admin-locale";
export default async function Page() {
  const t = adminDictionaries[await getAdminLocale()];
  return (
    <>
      <PageHeading
        title={t.csaCustomers.title}
        description={t.page.csaCustomersDescription}
        action={
          <Link className="button customer-add-action" href="/csa-customers/new">
            {t.csaCustomers.add}
          </Link>
        }
      />
      <CSACustomerList />
    </>
  );
}
