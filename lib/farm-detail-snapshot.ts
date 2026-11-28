import {
  notifyManager,
  replaceEqualDeep,
  type QueryClient,
  type QueryState,
} from "@tanstack/react-query";
import { farmDetailKey, farmDetailPrefix, farmNotFound } from "@/lib/farm-query";
import type { Farm } from "@/lib/types";

type FarmDetail = Farm & { capabilitiesUnverified?: true };
type DetailState = QueryState<FarmDetail | null>;
// The read carries its starting snapshot until structural sharing consumes it.
const detailReadBaseline = Symbol("detailReadBaseline");
type DetailRead = FarmDetail & { [detailReadBaseline]?: DetailState["data"] };

export function captureFarmDetail(client: QueryClient, farmId: string) {
  return client.getQueryState<FarmDetail | null>(farmDetailKey(farmId));
}

export function farmDetailRead(snapshot: Farm, before: DetailState | undefined): DetailRead {
  return { ...snapshot, [detailReadBaseline]: before?.data };
}

export function farmDetailNeedsRead(state: DetailState) {
  return (
    state.isInvalidated ||
    state.status === "error" ||
    state.dataUpdatedAt === 0 ||
    state.data?.capabilitiesUnverified === true
  );
}

function verified(state: DetailState | undefined) {
  if (state?.status === "success" && state.fetchStatus === "idle" && !farmDetailNeedsRead(state)) {
    return state.data ?? undefined;
  }
}

export function verifiedFarmDetail(client: QueryClient, farmId: string) {
  return verified(captureFarmDetail(client, farmId));
}

export function invalidateFarmDetail(client: QueryClient, farmId: string) {
  const filters = { queryKey: farmDetailKey(farmId), exact: true };
  const query = client.getQueryCache().find<Farm | null>(filters);
  if (!query || query.state.data === null) return;
  // Invalidation alone reuses a pending fetch if TanStack has no cached data yet.
  if (query.state.data === undefined && query.state.fetchStatus !== "idle") {
    void client.cancelQueries(filters);
  }
  // A second supply change still supersedes reads made after the first invalidation.
  if (query.state.isInvalidated) query.setState({ isInvalidated: true });
  return client.invalidateQueries(filters);
}

export function invalidateFarmDetailsAfterProductTransition(client: QueryClient) {
  // The transition does not return Farm IDs. Mark only known Farm details stale.
  for (const { queryKey } of client.getQueryCache().findAll({ queryKey: farmDetailPrefix })) {
    const farmId = queryKey[farmDetailPrefix.length];
    if (typeof farmId === "string") invalidateFarmDetail(client, farmId);
  }
}

function sameCapabilities(previous: Farm, snapshot: Farm) {
  return replaceEqualDeep(previous.capabilities, snapshot.capabilities) === previous.capabilities;
}

export function publishFarmDetail(
  client: QueryClient,
  snapshot: Farm,
  before: DetailState | undefined,
  source: "read" | "write",
): Farm | undefined {
  const queryKey = farmDetailKey(snapshot.id);
  const after = captureFarmDetail(client, snapshot.id);
  if (!before?.data || !after?.data) return;
  const cachedVersion = Math.max(before.data.version, after.data.version);

  if (
    after === before &&
    after.fetchStatus === "idle" &&
    snapshot.version >= cachedVersion &&
    (source === "read" || verified(after))
  ) {
    return client.setQueryData<Farm>(queryKey, snapshot);
  }

  const latest = verified(after);
  if (
    latest &&
    latest.version >= Math.max(cachedVersion, snapshot.version) &&
    (source === "read" || sameCapabilities(latest, snapshot)) &&
    (after.dataUpdateCount > before.dataUpdateCount ||
      (source === "write" && latest.version > snapshot.version))
  ) {
    return latest;
  }

  // The recovery caller can keep its request unresolved without re-reading an older revision.
  if (source === "read" && snapshot.version < cachedVersion) return;

  const filters = { queryKey, exact: true };
  const cache = client.getQueryCache();
  const query = cache.find<Farm | null>(filters);
  if (!query) return;
  const competingRead = after.fetchStatus === "idle" ? undefined : query.promise;
  const confirmed = snapshot.version > cachedVersion ? snapshot : after.data;
  notifyManager.batch(() => {
    // Keep versioned fields even if navigation cancels the competing GET.
    client.setQueryData(queryKey, { ...confirmed, capabilities: undefined }, { updatedAt: 0 });
    query.invalidate();
  });
  const refresh = () => {
    const { data, error } = query.state;
    if (cache.find(filters) === query && data && !data.capabilities && !farmNotFound(error)) {
      void client.invalidateQueries(filters, { cancelRefetch: false });
    }
  };
  // Queue one canonical read after the overlap. Its result never schedules another read.
  if (competingRead) void competingRead.then(refresh, refresh);
  else refresh();
}

export function shareFarmDetail(previous: unknown, incoming: unknown) {
  const cached = previous as Farm | null | undefined;
  const read = incoming as DetailRead | null;
  if (cached === null || read === null) return null;
  const { [detailReadBaseline]: baseline, ...snapshot } = read;
  const olderInformation = cached && cached.version > snapshot.version;
  const ambiguousCapability =
    cached &&
    detailReadBaseline in read &&
    cached !== baseline &&
    !sameCapabilities(cached, snapshot);
  const current = olderInformation ? cached : snapshot;
  // Compare the read's starting snapshot at cache settlement, including same-version changes.
  return replaceEqualDeep(
    cached,
    olderInformation || ambiguousCapability
      ? { ...current, capabilities: undefined, capabilitiesUnverified: true }
      : current,
  );
}
