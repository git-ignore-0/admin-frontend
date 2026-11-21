import { Button } from "@mantine/core";
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
          <Button component={Link} className="customer-add-action" href="/csa-customers/new">
            {t.csaCustomers.add}
          </Button>
        }
      />
      <CSACustomerList />
    </>
  );
}
