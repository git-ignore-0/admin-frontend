import { queryOptions } from "@tanstack/react-query";
import { farmSupplyKey } from "@/lib/farm-query";
import { getFarmProduct, listFarmStockBatches } from "@/lib/farms-api";
import type { FarmBatchScope, FarmProduct, StockBatchStatus } from "@/lib/types";

export type FarmBatchFilter = { scope: FarmBatchScope; status?: StockBatchStatus; page: number };

export function farmSourceQuery(farmId: string, productId: string) {
  return queryOptions({
    queryKey: [...farmSupplyKey(farmId), "source", productId],
    queryFn: ({ signal }) => getFarmProduct(farmId, productId, signal),
  });
}

export function farmBatchQuery(source: FarmProduct, filter: FarmBatchFilter) {
  return queryOptions({
    queryKey: [
      ...farmSupplyKey(source.farm_id),
      "batches",
      source.product_id,
      source.id,
      source.supply_generation,
      source.supply_status,
      filter,
    ],
    queryFn: ({ signal }) =>
      listFarmStockBatches(source.farm_id, source.product_id, filter, { signal, source }),
  });
}
