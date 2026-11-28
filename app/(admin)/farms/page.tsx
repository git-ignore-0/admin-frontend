import { redirect } from "next/navigation";

import { FarmList } from "@/components/farm-list";
import { adminDictionaries } from "@/lib/admin-i18n";
import { getAdminLocale } from "@/lib/admin-locale";
import { farmHref, readFarmRouteSearch, type FarmRouteSearch } from "@/lib/farm-navigation";

export async function generateMetadata() {
  return { title: adminDictionaries[await getAdminLocale()].common.farmList };
}

export default async function FarmsPage({
  searchParams,
}: {
  searchParams: Promise<FarmRouteSearch>;
}) {
  const search = await searchParams;
  if (search.tab !== undefined || search.setup !== undefined || search.view !== undefined) {
    return redirect(farmHref(readFarmRouteSearch(search)));
  }
  return <FarmList />;
}
