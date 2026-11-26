import { redirect } from "next/navigation";
import { legacyTrackerHref } from "@/lib/farm-navigation";

export default async function TrackerFarmDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, search] = await Promise.all([params, searchParams]);
  redirect(legacyTrackerHref(search, id));
}
