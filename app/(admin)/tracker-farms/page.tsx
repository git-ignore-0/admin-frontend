import { redirect } from "next/navigation";
import { legacyTrackerHref, type FarmRouteSearch } from "@/lib/farm-navigation";

export default async function TrackerFarmsPage({
  searchParams,
}: {
  searchParams: Promise<FarmRouteSearch>;
}) {
  redirect(legacyTrackerHref(await searchParams));
}
