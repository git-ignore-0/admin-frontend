import type { QueryClient } from "@tanstack/react-query";

const farmsKey = ["farms"] as const;
const supplyKey = ["farm-supply"] as const;
export const farmListKey = [...farmsKey, "list"] as const;
export const farmDetailKey = (farmId: string) =>
  [...farmsKey, "detail", farmId.toLowerCase()] as const;
export const farmSupplyKey = (farmId: string) => [...supplyKey, farmId.toLowerCase()] as const;

export function retireFarmQueries(client: QueryClient, farmId?: string) {
  client.removeQueries({ queryKey: farmId ? farmDetailKey(farmId) : farmsKey });
  const scope = farmId ? farmSupplyKey(farmId) : supplyKey;
  client.removeQueries({ queryKey: scope });
  const mutations = client.getMutationCache();
  for (const mutation of mutations.findAll({ mutationKey: scope })) mutations.remove(mutation);
}
