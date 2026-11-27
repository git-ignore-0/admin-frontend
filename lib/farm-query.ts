import {
  notifyManager,
  skipToken,
  useQuery,
  useMutationState,
  type MutationFilters,
  type QueryClient,
} from "@tanstack/react-query";
import { isApiObject, isProtectedDataError, type ClientApiError } from "@/lib/client-error";
import { isUncertainFarmSupplyWrite } from "@/lib/farm-stock";
import type { Farm } from "@/lib/types";

const farmsKey = ["farms"] as const;
const supplyKey = ["farm-supply"] as const;
const accessKey = ["farm-access"] as const;
const initialAccess = { revision: 0, error: null };
type FarmAccess = { revision: number; error: Error | null };

export const farmListKey = [...farmsKey, "list"] as const;
export const farmDetailKey = (farmId: string) =>
  [...farmsKey, "detail", farmId.toLowerCase()] as const;
export const farmSupplyKey = (farmId: string) => [...supplyKey, farmId.toLowerCase()] as const;
export const farmSupplyWriteKey = (farmId: string) => [...farmSupplyKey(farmId), "write"] as const;
export const farmBulkWriteKey = (farmId: string) =>
  [...farmSupplyWriteKey(farmId), "bulk"] as const;
export const farmBulkDraftKey = (farmId: string) =>
  [...farmSupplyKey(farmId), "bulk-draft"] as const;
const farmDeleteMutationKey = (farmId: string) =>
  [...farmsKey, "delete", farmId.toLowerCase()] as const;
const farmDetailWriteKey = (farmId: string) =>
  [...farmsKey, "write", farmId.toLowerCase()] as const;
export const farmDetailWriteFilters = (farmId: string) => ({
  mutationKey: farmDetailWriteKey(farmId),
  exact: true,
});

export const farmDeleteFilters = (farmId: string) => ({
  mutationKey: farmDeleteMutationKey(farmId),
  exact: true,
});

export function farmDeleteBlocksWrite(client: QueryClient, farmId: string) {
  return (
    isFarmGone(client, farmId) ||
    client.getMutationCache().findAll(farmDeleteFilters(farmId)).some(deleteBlocksWrite)
  );
}

function deleteBlocksWrite({ state }: { state: { status: string; data: unknown } }) {
  if (state.status === "pending") return true;
  return (
    isApiObject(state.data) &&
    isApiObject(state.data.issue) &&
    state.data.issue.kind === "uncertain"
  );
}

export function useFarmDeleteBlocksWrite(farmId: string) {
  return useMutationState({
    filters: farmDeleteFilters(farmId),
    select: deleteBlocksWrite,
  }).some(Boolean);
}

export function farmDetailWritePending(client: QueryClient, farmId: string) {
  return client.isMutating(farmDetailWriteFilters(farmId)) > 0;
}

export function farmNotFound(cause: unknown) {
  if (!(cause instanceof Error)) return false;
  const { status, message, payload } = cause as ClientApiError;
  const body: unknown = payload;
  return (
    status === 404 &&
    (message === "not_found" ||
      (message === "request_failed" &&
        isApiObject(body) &&
        typeof body.detail === "string" &&
        Boolean(body.detail.trim())))
  );
}

export function holdFarmDetailWrite(client: QueryClient, farmId: string) {
  // The existing Farm editor and header share a lease across route instances.
  let release!: () => void;
  const operation = new Promise<void>((resolve) => {
    release = resolve;
  });
  const cache = client.getMutationCache();
  const entry = cache.build(client, {
    mutationKey: farmDetailWriteKey(farmId),
    mutationFn: () => operation,
  });
  void entry.execute(undefined);
  return () => {
    release();
    cache.remove(entry);
  };
}

export function isFarmGone(client: QueryClient, farmId: string) {
  return client.getQueryData<Farm | null>(farmDetailKey(farmId)) === null;
}

export function confirmFarmGone(client: QueryClient, farmId: string) {
  const key = farmDetailKey(farmId);
  if (isFarmGone(client, farmId)) return;
  void client.cancelQueries({ queryKey: key, exact: true });
  client.setQueryData(key, null);
  retireFarmSupply(client, farmId);
  removeFarmMutations(client, farmDeleteMutationKey(farmId));
  void client.invalidateQueries({ queryKey: farmListKey });
}

export function farmDeleteSupplyWriteFilters(farmId: string): MutationFilters {
  const mutationKey = farmSupplyWriteKey(farmId);
  return {
    mutationKey,
    exact: false,
    predicate: ({ options, state }) => {
      const { variables, status, error } = state;
      const writer = options.mutationKey?.[mutationKey.length];
      if (writer === "bulk") return bulkBlocksWrite({ state });
      const action =
        isApiObject(variables) && isApiObject(variables.action) ? variables.action.kind : undefined;
      return (
        status === "pending" ||
        ((writer === "add" || action === "remove" || action === "readd") &&
          status === "error" &&
          !farmAccessDenied(error) &&
          isUncertainFarmSupplyWrite(error))
      );
    },
  };
}

function bulkBlocksWrite({ state }: { state: { status: string; data: unknown } }) {
  return (
    state.status === "pending" ||
    (isApiObject(state.data) &&
      isApiObject(state.data.failure) &&
      state.data.failure.kind === "unknown")
  );
}

const farmBulkWriteFilters = (farmId: string): MutationFilters => ({
  mutationKey: farmBulkWriteKey(farmId),
  exact: true,
  predicate: bulkBlocksWrite,
});

export function farmBulkBlocksWrite(client: QueryClient, farmId: string) {
  return Boolean(client.getMutationCache().find(farmBulkWriteFilters(farmId)));
}

export function useFarmBulkBlocksWrite(farmId: string) {
  return useMutationState({ filters: farmBulkWriteFilters(farmId), select: () => true }).length > 0;
}

export function farmAccessDenied(cause: unknown): cause is Error {
  // The BFF can reject a write's CSRF marker without revoking website-admin reads.
  return cause instanceof Error && isProtectedDataError(cause);
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
    removeFarmMutations(client, farmsKey);
  });
}

function removeFarmMutations(client: QueryClient, mutationKey: readonly string[]) {
  const mutations = client.getMutationCache();
  for (const mutation of mutations.findAll({ mutationKey })) mutations.remove(mutation);
}

export function retireFarmQueries(client: QueryClient, farmId: string) {
  if (!isFarmGone(client, farmId)) client.removeQueries({ queryKey: farmDetailKey(farmId) });
  retireFarmSupply(client, farmId);
}

function retireFarmSupply(client: QueryClient, farmId: string) {
  const scope = farmSupplyKey(farmId);
  client.removeQueries({ queryKey: scope });
  removeFarmMutations(client, scope);
}
