import { TrackerFarmManager } from "@/components/tracker-farm-manager";
import { adminDictionaries } from "@/lib/admin-i18n";
import { getAdminLocale } from "@/lib/admin-locale";

export async function generateMetadata() {
  const t = adminDictionaries[await getAdminLocale()];
  return { title: t.common.trackerFarms };
}

export default function TrackerFarmsPage() {
  return <TrackerFarmManager />;
}
