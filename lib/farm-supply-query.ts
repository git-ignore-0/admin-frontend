import { notifyManager, queryOptions, type QueryClient } from "@tanstack/react-query";
import { invalidateFarmDetail } from "@/lib/farm-detail-snapshot";
import { farmListKey, farmSupplyKey } from "@/lib/farm-query";
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

export function invalidateFarmProductLinks(
  client: QueryClient,
  farmId: string,
  productIds: readonly string[],
  confirmed: boolean,
) {
  const scope = farmSupplyKey(farmId);
  const ids = new Set(productIds);
  notifyManager.batch(() => {
    if (confirmed) {
      invalidateFarmDetail(client, farmId);
      void client.invalidateQueries({ queryKey: farmListKey });
    }
    void client.invalidateQueries({
      queryKey: scope,
      predicate: ({ queryKey }) => {
        const group = queryKey[scope.length];
        const productId = queryKey[scope.length + 1];
        return (
          group === "available" ||
          group === "list" ||
          group === "eligible" ||
          ((group === "source" || group === "batches" || group === "history") &&
            typeof productId === "string" &&
            ids.has(productId))
        );
      },
    });
  });
}
