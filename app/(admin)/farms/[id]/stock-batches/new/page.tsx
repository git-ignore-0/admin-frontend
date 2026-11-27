import { notFound, redirect } from "next/navigation";

import { FarmBulkSupply } from "@/components/farm-bulk-supply";
import { UUID_PATH_SEGMENT } from "@/lib/backend-target";
import { farmHref, readFarmRouteSearch, type FarmRouteSearch } from "@/lib/farm-navigation";

export default async function FarmBulkSupplyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<FarmRouteSearch>;
}) {
  const { id } = await params;
  if (!UUID_PATH_SEGMENT.test(id)) notFound();
  if (id !== id.toLowerCase()) {
    redirect(
      farmHref(readFarmRouteSearch(await searchParams), { id: id.toLowerCase(), bulk: true }),
    );
  }
  return <FarmBulkSupply key={id} farmId={id} />;
}
