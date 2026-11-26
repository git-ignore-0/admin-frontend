import { notifyManager, skipToken, useQuery, type QueryClient } from "@tanstack/react-query";
import { isProtectedDataError } from "@/lib/client-error";

const farmsKey = ["farms"] as const;
const supplyKey = ["farm-supply"] as const;
const accessKey = ["farm-access"] as const;
const initialAccess = { revision: 0, error: null };
type FarmAccess = { revision: number; error: Error | null };

export const farmListKey = [...farmsKey, "list"] as const;
export const farmDetailKey = (farmId: string) =>
  [...farmsKey, "detail", farmId.toLowerCase()] as const;
export const farmSupplyKey = (farmId: string) => [...supplyKey, farmId.toLowerCase()] as const;

export function farmAccessDenied(cause: unknown): cause is Error {
  // The BFF can reject a write's CSRF marker without revoking website-admin reads.
  return cause instanceof Error && cause.message !== "csrf_rejected" && isProtectedDataError(cause);
}

export function farmAccess(client: QueryClient) {
  return client.getQueryData<FarmAccess>(accessKey) ?? initialAccess;
}

export function useFarmAccess() {
  return (
    useQuery<FarmAccess>({
      queryKey: accessKey,
      queryFn: skipToken,
      gcTime: Infinity,
    }).data ?? initialAccess
  );
}

export function retryFarmAccess(client: QueryClient) {
  const { revision, error } = farmAccess(client);
  if (error) client.setQueryData<FarmAccess>(accessKey, { revision, error: null });
}

// All Farm endpoints use the same website-admin permission. Keep this denial
// within the Farm domain and the current QueryClient, including across routes.
export function retireFarmAccess(client: QueryClient, error: Error) {
  const previous = farmAccess(client);
  if (previous.error === error) return;
  notifyManager.batch(() => {
    client.setQueryData<FarmAccess>(accessKey, { revision: previous.revision + 1, error });
    for (const queryKey of [farmsKey, supplyKey]) {
      const entries = client.getQueryCache().findAll({ queryKey });
      for (const query of entries) {
        if (query.getObserversCount()) query.reset();
        else client.getQueryCache().remove(query);
      }
    }
    removeFarmMutations(client, supplyKey);
  });
}

function removeFarmMutations(client: QueryClient, mutationKey: readonly string[]) {
  const mutations = client.getMutationCache();
  for (const mutation of mutations.findAll({ mutationKey })) mutations.remove(mutation);
}

export function retireFarmQueries(client: QueryClient, farmId: string) {
  client.removeQueries({ queryKey: farmDetailKey(farmId) });
  const scope = farmSupplyKey(farmId);
  client.removeQueries({ queryKey: scope });
  removeFarmMutations(client, scope);
}
