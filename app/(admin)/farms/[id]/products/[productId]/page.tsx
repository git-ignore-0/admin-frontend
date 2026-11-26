import { notFound, redirect } from "next/navigation";

import { FarmDetail } from "@/components/farm-detail";
import { UUID_PATH_SEGMENT } from "@/lib/backend-target";
import { farmHref, readFarmRouteSearch, type FarmRouteSearch } from "@/lib/farm-navigation";

export default async function FarmSourcePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; productId: string }>;
  searchParams: Promise<FarmRouteSearch>;
}) {
  const { id, productId } = await params;
  if (!UUID_PATH_SEGMENT.test(id) || !UUID_PATH_SEGMENT.test(productId)) notFound();
  if (id !== id.toLowerCase() || productId !== productId.toLowerCase()) {
    redirect(
      farmHref(readFarmRouteSearch(await searchParams), {
        id: id.toLowerCase(),
        productId: productId.toLowerCase(),
      }),
    );
  }
  return <FarmDetail farmId={id} productId={productId} />;
}
