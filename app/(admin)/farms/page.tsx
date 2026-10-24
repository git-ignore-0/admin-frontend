import { FarmList } from "@/components/farm-list";
import { adminDictionaries } from "@/lib/admin-i18n";
import { getAdminLocale } from "@/lib/admin-locale";

export async function generateMetadata() {
  return { title: adminDictionaries[await getAdminLocale()].common.farmList };
}

export default function FarmsPage() {
  return <FarmList />;
}
