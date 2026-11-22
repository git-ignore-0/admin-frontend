import { CSAPurchaseRequestList } from "@/components/csa-purchase-request-list";
import { adminDictionaries } from "@/lib/admin-i18n";
import { getAdminLocale } from "@/lib/admin-locale";

export async function generateMetadata() {
  const t = adminDictionaries[await getAdminLocale()];
  return { title: t.csaPurchases.title };
}

export default function Page() {
  return <CSAPurchaseRequestList />;
}
