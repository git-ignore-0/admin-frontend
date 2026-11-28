import { redirect } from "next/navigation";
import { legacyTrackerHref, type FarmRouteSearch } from "@/lib/farm-navigation";

export default async function TrackerFarmDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<FarmRouteSearch>;
}) {
  const [{ id }, search] = await Promise.all([params, searchParams]);
  redirect(legacyTrackerHref(search, id));
}
