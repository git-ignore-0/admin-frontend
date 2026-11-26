import { redirect } from "next/navigation";
import { legacyTrackerHref } from "@/lib/farm-navigation";

export default async function NewTrackerFarmPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(legacyTrackerHref(await searchParams, "new"));
}
