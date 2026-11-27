"use client";

import {
  useIsMutating,
  useMutation,
  useMutationState,
  useQueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { useLayoutEffect, useRef, useState } from "react";

import { useIsAdminQueryScopeCurrent } from "@/components/admin-query-provider";
import { apiErrorContext, type ClientApiError } from "@/lib/client-error";
import { invalidateFarmDetail } from "@/lib/farm-detail-snapshot";
import {
  farmAccess,
  farmAccessDenied,
  farmDeleteBlocksWrite,
  farmListKey,
  farmSupplyKey,
  farmSupplyWriteKey,
  retireFarmAccess,
  useFarmDeleteBlocksWrite,
} from "@/lib/farm-query";
import {
  cancelFarmStockBatch,
  createFarmStockBatch,
  parseFarmSourceBlocker,
  readdFarmProduct,
  removeFarmProduct,
  updateFarmStockBatch,
} from "@/lib/farms-api";
import { isUncertainFarmSupplyWrite } from "@/lib/farm-stock";
import { farmBatchQuery, farmSourceQuery, type FarmBatchFilter } from "@/lib/farm-supply-query";
import type {
  FarmProductDetail,
  FarmSourceBlocker,
  FarmStockBatch,
  StockBatchInput,
} from "@/lib/types";

type SourceAction<Kind extends string> = { kind: Kind; source: FarmProductDetail };
type BatchAction<Kind extends string> = SourceAction<Kind> & {
  batch: FarmStockBatch;
};
export type FarmSupplyAction =
  | SourceAction<"remove">
  | SourceAction<"readd">
  | SourceAction<"create">
  | BatchAction<"edit">
  | BatchAction<"cancel">;
type Attempt = { action: FarmSupplyAction; input?: StockBatchInput; startedAt: number };
type Failure = {
  type: "uncertain" | "conflict" | "rejected";
  cause: unknown;
  blocker?: FarmSourceBlocker;
};
type Review = "matches" | "changed" | "unknown" | "batch_missing";

const guardsWithoutRevisionChange = new Set(["stock_reserved", "stock_sold"]);

export function sameFarmSourceRevision(a: FarmProductDetail, b: FarmProductDetail) {
  return (
    a.id === b.id &&
    a.version === b.version &&
    a.supply_generation === b.supply_generation &&
    a.supply_status === b.supply_status
  );
}

function batchMatchesInput(batch: FarmStockBatch, input: StockBatchInput | undefined) {
  return Boolean(
    input &&
    batch.start_date === input.start_date &&
    batch.end_date === input.end_date &&
    batch.quantity_units === input.quantity_units,
  );
}

async function writeSupply({ action, input }: Attempt) {
  const { source } = action;
  const { farm_id, product_id } = source;
  if (action.kind === "remove") return removeFarmProduct(farm_id, product_id, source);
  if (action.kind === "cancel")
    return cancelFarmStockBatch(farm_id, product_id, action.batch.id, action.batch.version, source);
  if (!input) throw new Error("validation_error");
  if (action.kind === "edit")
    return updateFarmStockBatch(
      farm_id,
      product_id,
      action.batch.id,
      { ...input, version: action.batch.version },
      source,
    );
  if (action.kind === "readd") return readdFarmProduct(farm_id, product_id, source, input);
  return createFarmStockBatch(farm_id, product_id, input, source);
}

export function useFarmSourceWrite(
  farmId: string,
  productId: string,
  onAccessLost?: (cause: unknown) => void,
) {
  const client = useQueryClient();
  const currentSession = useIsAdminQueryScopeCurrent();
  const scope = farmSupplyKey(farmId);
  const writeScope = farmSupplyWriteKey(farmId);
  const mutationKey = [...writeScope, "source", productId];
  const supplyWriting = useIsMutating({ mutationKey: writeScope }) > 0;
  const deletionLocked = useFarmDeleteBlocksWrite(farmId);
  const isWriting = supplyWriting || deletionLocked;
  // Only uncertain outcomes survive the finally block until review or session retirement.
  const mutation = useMutation({ mutationKey, mutationFn: writeSupply, gcTime: Infinity });
  const cache = client.getMutationCache();
  const [unconfirmed] = useMutationState({
    filters: { mutationKey, exact: true, status: "error" },
    select: (entry) => entry,
  })
    .filter(
      ({ state }) => !farmAccessDenied(state.error) && isUncertainFarmSupplyWrite(state.error),
    )
    .slice(-1);
  const mounted = useRef(false);
  const operation = useRef(false);
  const recoveryRead = useRef<QueryKey | null>(null);
  const [localFailure, setFailure] = useState<Failure | null>(null);
  const failure =
    localFailure ??
    (unconfirmed ? { type: "uncertain" as const, cause: unconfirmed.state.error } : null);
  const [review, setReview] = useState<Review | null>(null);
  const [checking, setChecking] = useState(false);
  const submitted = useRef<Attempt | null>(null);

  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const key = recoveryRead.current;
      queueMicrotask(() => {
        if (
          !mounted.current &&
          key &&
          client.getQueryCache().find({ queryKey: key, exact: true })?.getObserversCount() === 0
        ) {
          void client.cancelQueries({ queryKey: key, exact: true });
        }
      });
    };
  }, [client]);

  function reset() {
    if (unconfirmed) cache.remove(unconfirmed);
    submitted.current = null;
    setFailure(null);
    setReview(null);
  }

  function active() {
    return currentSession() && mounted.current;
  }

  function sameAccess(revision: number) {
    const access = farmAccess(client);
    return currentSession() && access.revision === revision && !access.error;
  }

  function retireIfDenied(cause: unknown) {
    if (!currentSession() || !farmAccessDenied(cause)) return false;
    retireFarmAccess(client, cause);
    if (mounted.current) onAccessLost?.(cause);
    return true;
  }

  function refreshDependents(kind: FarmSupplyAction["kind"], observedWrite: boolean) {
    const lifecycle = kind === "remove" || kind === "readd";
    void client.invalidateQueries({
      queryKey: [...scope, "batches", productId],
      refetchType: lifecycle ? "none" : "active",
    });
    if (!observedWrite) return;
    void client.invalidateQueries({ queryKey: [...scope, "list"] });
    void client.invalidateQueries({ queryKey: farmListKey });
    if (lifecycle) {
      invalidateFarmDetail(client, farmId);
      void client.invalidateQueries({ queryKey: [...scope, "history", productId] });
    }
  }

  async function inspect(
    attempt: Attempt,
    reason: Failure,
    visiblePage: FarmBatchFilter,
    accessRevision: number,
  ) {
    const canUpdate = () => active() && sameAccess(accessRevision);
    const query = farmSourceQuery(farmId, productId);
    recoveryRead.current = query.queryKey;
    const latest = await client.fetchQuery(query);
    if (!canUpdate()) return;
    const { action, input } = attempt;
    const previous = action.source;
    const sameLink = latest.id === previous.id;
    const newer = sameLink && latest.version > previous.version;
    if (reason.type === "conflict") {
      refreshDependents(action.kind, !sameFarmSourceRevision(latest, previous));
      setReview("changed");
      return;
    }
    if (!sameLink) return setReview("changed");
    if (action.kind === "remove") {
      const expected =
        newer &&
        latest.version === previous.version + 1 &&
        latest.supply_generation === previous.supply_generation &&
        latest.supply_status === "removed";
      if (newer) refreshDependents("remove", true);
      return setReview(expected ? "matches" : newer ? "changed" : "unknown");
    }
    if (action.kind === "readd" || action.kind === "create") {
      if (!newer) return setReview("unknown");
      refreshDependents(action.kind, true);
      const expectedGeneration = previous.supply_generation + (action.kind === "readd" ? 1 : 0);
      if (
        latest.supply_status !== "supplying" ||
        latest.supply_generation !== expectedGeneration ||
        latest.version !== previous.version + 1
      )
        return setReview("changed");
      // Without the returned batch UUID, an identical batch is evidence about current state,
      // not attribution of the write. Another administrator can submit the same values.
      const batches = farmBatchQuery(latest, { scope: "current", page: 1 });
      recoveryRead.current = batches.queryKey;
      const page = await client.fetchQuery(batches);
      if (!canUpdate()) return;
      return setReview(
        page.data.some((batch) => batchMatchesInput(batch, input)) ? "matches" : "batch_missing",
      );
    }
    if ("batch" in action) {
      const { batch } = action;
      if (
        latest.version < previous.version ||
        latest.supply_generation < previous.supply_generation
      )
        return setReview("unknown");
      if (
        latest.supply_generation !== previous.supply_generation ||
        latest.supply_status === "removed"
      ) {
        refreshDependents("remove", true);
        return setReview("changed");
      }
      const batches = farmBatchQuery(latest, visiblePage);
      const findBatch = (rows: FarmStockBatch[]) =>
        rows.find(
          (row) =>
            row.id === batch.id &&
            row.farm_product_id === latest.id &&
            row.supply_generation === batch.supply_generation &&
            row.source_version >= latest.version &&
            !row.is_historical,
        );
      const cached = client.getQueryState(batches.queryKey);
      let row = cached?.data && findBatch(cached.data.data);
      if (
        !row ||
        row.version <= batch.version ||
        cached?.status !== "success" ||
        cached.isInvalidated ||
        cached.dataUpdatedAt < attempt.startedAt
      ) {
        recoveryRead.current = batches.queryKey;
        const { data } = await client.fetchQuery(batches);
        if (!canUpdate()) return;
        row = findBatch(data);
      }
      if (!row) return setReview("batch_missing");
      if (row.version <= batch.version) return setReview("unknown");
      void client.invalidateQueries({ queryKey: [...scope, "list"] });
      void client.invalidateQueries({ queryKey: farmListKey });
      const expected =
        row.version === batch.version + 1 &&
        (action.kind === "cancel" ? row.status === "cancelled" : batchMatchesInput(row, input));
      return setReview(expected ? "matches" : "changed");
    }
  }

  async function check(attempt: Attempt, reason: Failure, visiblePage: FarmBatchFilter) {
    const { revision } = farmAccess(client);
    if (!sameAccess(revision)) return;
    setChecking(true);
    setReview(null);
    try {
      await inspect(attempt, reason, visiblePage, revision);
    } catch (cause) {
      if (!retireIfDenied(cause) && active() && sameAccess(revision)) setReview("unknown");
    } finally {
      recoveryRead.current = null;
      if (active() && sameAccess(revision)) setChecking(false);
    }
  }

  async function submit(
    action: FarmSupplyAction,
    visiblePage: FarmBatchFilter,
    onSuccess: () => void,
    input?: StockBatchInput,
  ) {
    const { revision } = farmAccess(client);
    if (
      !active() ||
      !sameAccess(revision) ||
      operation.current ||
      isWriting ||
      farmDeleteBlocksWrite(client, farmId)
    )
      return;
    operation.current = true;
    const attempt = { action, input, startedAt: Date.now() };
    submitted.current = attempt;
    setFailure(null);
    let uncertain = false;
    try {
      await mutation.mutateAsync(attempt);
      if (!sameAccess(revision)) return;
      void client.invalidateQueries({ queryKey: farmSourceQuery(farmId, productId).queryKey });
      refreshDependents(action.kind, true);
      if (active()) onSuccess();
    } catch (cause) {
      if (retireIfDenied(cause) || !sameAccess(revision)) return;
      uncertain = isUncertainFarmSupplyWrite(cause);
      if (!active()) return;
      const { message, status } = (cause ?? {}) as ClientApiError;
      const conflict = status === 409 && !guardsWithoutRevisionChange.has(message);
      const blocker =
        conflict &&
        (message === "farm_product_has_open_allocations" ||
          message === "farm_product_supply_shortfall")
          ? parseFarmSourceBlocker({ code: message, context: apiErrorContext(cause) })
          : undefined;
      const next: Failure = {
        type: uncertain ? "uncertain" : conflict ? "conflict" : "rejected",
        cause,
        blocker,
      };
      setFailure(next);
      if (next.type === "conflict") await check(attempt, next, visiblePage);
    } finally {
      if (!uncertain) {
        const entry = cache.find({
          mutationKey,
          exact: true,
          predicate: (row) => row.state.variables === attempt,
        });
        if (entry) cache.remove(entry);
      }
      operation.current = false;
    }
  }

  const attempt = submitted.current ?? (unconfirmed?.state.variables as Attempt | undefined);
  function recover(visiblePage: FarmBatchFilter) {
    if (!failure || !attempt || operation.current || !active()) return;
    operation.current = true;
    void check(attempt, failure, visiblePage).finally(() => {
      operation.current = false;
    });
  }

  return {
    failure,
    review,
    checking,
    pending: mutation.isPending,
    attemptedKind: attempt?.action.kind,
    reviewingBatchId:
      failure?.type === "uncertain" && attempt && "batch" in attempt.action
        ? attempt.action.batch.id
        : undefined,
    isWriting,
    reset,
    submit,
    recover,
  };
}
