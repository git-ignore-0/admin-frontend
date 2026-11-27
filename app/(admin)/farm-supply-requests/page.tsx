import { AdminSupplyRequestList } from "@/components/admin-supply-request-list";
import { adminDictionaries } from "@/lib/admin-i18n";
import { getAdminLocale } from "@/lib/admin-locale";

export async function generateMetadata() {
  return { title: adminDictionaries[await getAdminLocale()].common.farmSupplyRequests };
}

export default function Page() {
  return <AdminSupplyRequestList />;
}
