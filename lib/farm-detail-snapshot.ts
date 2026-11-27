import {
  notifyManager,
  replaceEqualDeep,
  type QueryClient,
  type QueryState,
} from "@tanstack/react-query";
import { farmDetailKey } from "@/lib/farm-query";
import type { Farm } from "@/lib/types";

type DetailState = QueryState<Farm | null>;

export function captureFarmDetail(client: QueryClient, farmId: string) {
  return client.getQueryState<Farm | null>(farmDetailKey(farmId));
}

export function farmDetailNeedsRead(state: DetailState) {
  return state.isInvalidated || state.status === "error" || state.dataUpdatedAt === 0;
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
  // A second supply change still supersedes reads made after the first invalidation.
  if (query.state.isInvalidated) query.setState({ isInvalidated: true });
  void client.invalidateQueries(filters);
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
    (after.dataUpdateCount > before.dataUpdateCount ||
      (source === "write" && latest.version > snapshot.version))
  ) {
    return latest;
  }

  // The recovery caller can keep its request unresolved without re-reading an older revision.
  if (source === "read" && snapshot.version < cachedVersion) return;

  notifyManager.batch(() => {
    if (snapshot.version > cachedVersion) {
      // Preserve the confirmed fields across a refetch or its cancellation on route exit.
      // The timestamp remains unverified even if cancellation restores this manual write.
      client.setQueryData(queryKey, { ...snapshot, capabilities: undefined }, { updatedAt: 0 });
    }
    void client.invalidateQueries({ queryKey, exact: true }, { cancelRefetch: false });
  });
}

export function shareFarmDetail(previous: unknown, incoming: unknown) {
  const cached = previous as Farm | null | undefined;
  const snapshot = incoming as Farm | null;
  if (cached === null) return null;
  // A GET already in flight may see an older revision than a confirmed PATCH.
  // The canonical GET still supplies capability, which is independent of Farm.version.
  return replaceEqualDeep(
    cached,
    cached && snapshot && cached.version > snapshot.version
      ? { ...cached, capabilities: snapshot.capabilities }
      : snapshot,
  );
}
