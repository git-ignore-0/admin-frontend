"use client";

import { useRef, useState } from "react";
import {
  matchMutation,
  queryOptions,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import {
  useAdminRecordScope,
  useIsAdminQueryScopeCurrent,
} from "@/components/admin-query-provider";
import { useAdminMutationIntent } from "@/lib/admin-mutation-intent";
import { invalidApiResponse, isUncertainMutationError } from "@/lib/client-error";
import { invalidateFarmDetail } from "@/lib/farm-detail-snapshot";
import {
  farmAccess,
  farmAccessDenied,
  farmDecisionIntentKey,
  farmDeleteBlocksWrite,
  farmDeleteSupplyWriteFilters,
  farmListKey,
  farmSupplyKey,
  farmSupplyRequestDetailKey,
  farmSupplyRequestListKey,
  farmSupplyDecisionWriteKey,
  isFarmGone,
  retireFarmAccess,
} from "@/lib/farm-query";
import {
  adminSupplyRequest,
  decideSupplyRequest,
  type AdminSupplyRequest,
} from "@/lib/farm-supply-request-api";

export type SupplyDecisionAction = "approve" | "reject";

type Decision = {
  action: SupplyDecisionAction;
  fields: { idempotency_key: string; reason?: string };
  farmId: string;
};

type DecisionReport =
  | { kind: "confirmed"; action: SupplyDecisionAction }
  | { kind: "processed" | "pending" }
  | { kind: "error"; error: unknown };

export function useFarmSupplyDecision(requestId: string, item?: AdminSupplyRequest) {
  const client = useQueryClient();
  const sessionCurrent = useIsAdminQueryScopeCurrent();
  const record = useAdminRecordScope(requestId);
  const { intent, controls } = useAdminMutationIntent<Decision>(
    farmDecisionIntentKey[1],
    requestId,
  );
  const [report, setReport] = useState<DecisionReport>();
  const farmId = item?.farm.id;
  const mutationKey = farmSupplyDecisionWriteKey(farmId ?? "", requestId);
  const mutationCache = client.getMutationCache();
  const detailKey = farmSupplyRequestDetailKey(requestId);
  const [checking, setChecking] = useState(false);
  const checkingNow = useRef(false);

  function allowed(revision: number, targetFarm: string) {
    const access = farmAccess(client);
    return (
      sessionCurrent() &&
      access.revision === revision &&
      !access.error &&
      !isFarmGone(client, targetFarm)
    );
  }

  function clearSettledMutations() {
    const filters = { mutationKey, exact: true };
    for (const previous of mutationCache.findAll(filters)) {
      if (previous.state.status !== "pending") mutationCache.remove(previous);
    }
  }

  async function publish(latest: AdminSupplyRequest, revision: number, targetFarm: string) {
    await client.cancelQueries({ queryKey: detailKey, exact: true });
    if (!allowed(revision, targetFarm)) return false;
    client.setQueryData(detailKey, latest);
    if (latest.status !== "pending") invalidateDecision(client, latest);
    return true;
  }

  async function readCurrent() {
    try {
      const data = await client.fetchQuery(
        supplyRequestDetailOptions(client, sessionCurrent, requestId),
      );
      return { data, error: undefined };
    } catch (error) {
      return { data: undefined, error };
    }
  }

  async function run(action?: SupplyDecisionAction, reason?: string) {
    if (!farmId || !item || checkingNow.current || !sessionCurrent()) return;
    const current = client.getQueryData<AdminSupplyRequest>(detailKey);
    const prior = controls.read();
    const retry = prior?.phase === "unknown";
    if (
      (action === undefined && !retry) ||
      (action !== undefined && (prior || current?.status !== "pending"))
    ) {
      return;
    }
    const { revision } = farmAccess(client);
    if (!allowed(revision, farmId) || farmDeleteBlocksWrite(client, farmId)) return;
    const relatedWrites = mutationCache.findAll(farmDeleteSupplyWriteFilters(farmId));
    if (
      relatedWrites.some(
        (write) =>
          write.state.status === "pending" || !matchMutation({ mutationKey, exact: true }, write),
      )
    )
      return;

    const attempt = controls.begin(
      action
        ? {
            action,
            farmId,
            fields: {
              idempotency_key: crypto.randomUUID(),
              ...(action === "reject" ? { reason } : {}),
            },
          }
        : undefined,
    );
    if (!attempt) return;
    const captured = record.capture();
    const updateUi = (result: DecisionReport | undefined) => {
      if (captured()) setReport(result);
    };
    updateUi(undefined);
    clearSettledMutations();

    const mutation = mutationCache.build(client, {
      gcTime: Infinity,
      mutationKey,
      mutationFn: async () => {
        try {
          const response = await decideSupplyRequest(
            requestId,
            attempt.payload.action,
            attempt.payload.fields,
          );
          if (!allowed(revision, farmId)) return "retired";
          if (response.data.farm.id !== farmId) throw invalidApiResponse();
          if (!(await publish(response.data, revision, farmId))) return "retired";
          controls.settle(attempt, null);
          updateUi({ kind: "confirmed", action: attempt.payload.action });
          return "confirmed";
        } catch (error) {
          if (!allowed(revision, farmId)) return "retired";
          if (farmAccessDenied(error)) {
            retireFarmAccess(client, error);
            updateUi(undefined);
            return "retired";
          }
          const code = error instanceof Error ? error.message : "";
          const unknown = retry || isUncertainMutationError(error);
          if (
            unknown ||
            code === "farm_supply_request_processed" ||
            code === "idempotency_conflict"
          ) {
            const latest = await readCurrent();
            if (!allowed(revision, farmId)) return "retired";
            if (farmAccessDenied(latest.error)) {
              retireFarmAccess(client, latest.error);
              return "retired";
            }
            if (
              latest.data?.farm.id === farmId &&
              latest.data.status !== "pending" &&
              !latest.error
            ) {
              invalidateDecision(client, latest.data);
              controls.settle(attempt, null);
              updateUi({ kind: "processed" });
              return "confirmed";
            }
          }
          if (
            unknown ||
            code === "farm_supply_request_processed" ||
            code === "idempotency_conflict"
          ) {
            controls.settle(attempt, { phase: "unknown", payload: attempt.payload });
            if (!unknown) updateUi({ kind: "error", error });
            return "unknown";
          }
          controls.settle(attempt, null);
          updateUi({ kind: "error", error });
          return "rejected";
        }
      },
    });
    const outcome = await mutation.execute(undefined);
    if (outcome !== "unknown") mutationCache.remove(mutation);
  }

  async function checkStatus() {
    const previous = controls.read();
    if (!farmId || previous?.phase !== "unknown" || checkingNow.current) return;
    const current = record.capture();
    const { revision } = farmAccess(client);
    if (!allowed(revision, farmId)) return;
    checkingNow.current = true;
    setChecking(true);
    const latest = await readCurrent();
    checkingNow.current = false;
    if (current()) setChecking(false);
    if (!allowed(revision, farmId) || controls.read() !== previous) return;
    if (latest.error) {
      if (farmAccessDenied(latest.error)) retireFarmAccess(client, latest.error);
      else if (current()) setReport({ kind: "error", error: latest.error });
      return;
    }
    if (!latest.data || latest.data.farm.id !== farmId) return;
    if (latest.data.status !== "pending") {
      controls.clear();
      clearSettledMutations();
      invalidateDecision(client, latest.data);
      if (current()) setReport({ kind: "processed" });
    } else if (current()) {
      setReport({ kind: "pending" });
    }
  }

  return { intent, report, setReport, checking, checkStatus, run };
}

function invalidateDecision(client: QueryClient, result: AdminSupplyRequest) {
  void client.invalidateQueries({ queryKey: farmSupplyRequestListKey });
  const farmId = result.farm.id;
  invalidateFarmDetail(client, farmId);
  if (result.status !== "approved") return;
  const products = new Set(result.items.map((item) => item.product_id));
  const scope = farmSupplyKey(farmId);
  void client.invalidateQueries({ queryKey: farmListKey });
  void client.invalidateQueries({
    queryKey: scope,
    predicate: ({ queryKey }) => {
      const kind = queryKey[scope.length];
      const productId = queryKey[scope.length + 1];
      return (
        kind === "list" ||
        kind === "eligible" ||
        ((kind === "source" || kind === "batches" || kind === "history") &&
          typeof productId === "string" &&
          products.has(productId))
      );
    },
  });
}

export function supplyRequestDetailOptions(
  client: QueryClient,
  current: () => boolean,
  id: string,
) {
  return queryOptions({
    queryKey: farmSupplyRequestDetailKey(id),
    async queryFn({ signal }) {
      const start = farmAccess(client);
      try {
        const item = await adminSupplyRequest(id, signal);
        signal.throwIfAborted();
        if (
          !current() ||
          start.revision !== farmAccess(client).revision ||
          isFarmGone(client, item.farm.id)
        )
          throw new DOMException("Obsolete supply request", "AbortError");
        return item;
      } catch (error) {
        if (
          current() &&
          !signal.aborted &&
          start.revision === farmAccess(client).revision &&
          farmAccessDenied(error)
        )
          retireFarmAccess(client, error);
        throw error;
      }
    },
  });
}
