import { notFound, redirect } from "next/navigation";

import { FarmBulkSupply } from "@/components/farm-bulk-supply";
import { UUID_PATH_SEGMENT } from "@/lib/backend-target";
import {
  farmHref,
  readFarmRouteSearch,
  readFarmSupplyProduct,
  type FarmRouteSearch,
} from "@/lib/farm-navigation";

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
    const search = readFarmRouteSearch(await searchParams);
    redirect(
      farmHref(search, {
        id: id.toLowerCase(),
        bulk: true,
        supplyProductId: readFarmSupplyProduct(search),
      }),
    );
  }
  return <FarmBulkSupply key={id} farmId={id} />;
}
