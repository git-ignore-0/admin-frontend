import { redirect } from "next/navigation";

import { farmHref, readFarmRouteSearch, type FarmRouteSearch } from "@/lib/farm-navigation";

export default async function EditFarmPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<FarmRouteSearch>;
}) {
  const [{ id }, search] = await Promise.all([params, searchParams]);
  redirect(farmHref(readFarmRouteSearch(search), { id, tab: "information" }));
}
