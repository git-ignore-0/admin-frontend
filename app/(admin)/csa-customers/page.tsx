import { CSACustomerList } from "@/components/csa-customer-list";
import { adminDictionaries } from "@/lib/admin-i18n";
import { getAdminLocale } from "@/lib/admin-locale";

export async function generateMetadata() {
  const t = adminDictionaries[await getAdminLocale()];
  return { title: t.csaCustomers.title };
}

export default function CSACustomersPage() {
  return <CSACustomerList />;
}
