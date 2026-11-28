"use client";

import {
  useMutation,
  useMutationState,
  useQueryClient,
  type MutationFilters,
} from "@tanstack/react-query";

import {
  useAdminRecordScope,
  useIsAdminQueryScopeCurrent,
} from "@/components/admin-query-provider";
import { isApiObject, isUncertainMutationError, type ClientApiError } from "@/lib/client-error";
import { invalidateFarmDetail } from "@/lib/farm-detail-snapshot";
import {
  farmAccess,
  farmAccessDenied,
  farmDeleteBlocksWrite,
  farmDeleteSupplyWriteFilters,
  farmNotFound,
  farmProductBulkRemoveWriteKey,
  isFarmGone,
  retireFarmAccess,
  useFarmAccess,
  useFarmDeleteBlocksWrite,
} from "@/lib/farm-query";
import { isUncertainFarmSupplyWrite } from "@/lib/farm-stock";
import { invalidateFarmProductLinks } from "@/lib/farm-supply-query";
import {
  MAX_FARM_PRODUCT_REMOVALS,
  recoverFarmProductBulkRemove,
  removeFarmProductsBulk,
  type FarmProductBulkRemoveIntent,
} from "@/lib/farms-api";
import type { FarmProduct } from "@/lib/types";

type Intent = Readonly<{
  products: readonly Readonly<FarmProduct>[];
  payload: FarmProductBulkRemoveIntent;
}>;

type Failure = {
  kind: "unknown" | "conflict" | "idempotency_conflict" | "rejected";
  cause: unknown;
  item?: { productId: string; code: string; context: unknown };
  receiptNotFound?: boolean;
};

type Attempt = {
  kind: "submit" | "recover" | "retry";
  intent: Intent;
  revision: number;
  previous?: Failure;
};
type Outcome = { count?: number; failure?: Failure; denied?: Error };
type OnSuccess = (count: number) => void;

const itemConflictCodes = new Set([
  "farm_product_changed",
  "farm_product_identity_changed",
  "farm_product_version_conflict",
  "farm_product_removed",
  "farm_product_has_open_allocations",
  "farm_product_supply_shortfall",
]);

function matchItemConflict(error: ClientApiError, intent: Intent): Failure["item"] {
  const errors: unknown = error.payload?.errors;
  if (!Array.isArray(errors)) return;
  for (const item of errors) {
    if (!isApiObject(item) || item.code !== error.message || !isApiObject(item.context)) continue;
    const { item_index, product_id } = item.context;
    if (typeof product_id !== "string") continue;
    const index = intent.payload.items.findIndex(({ product_id: id }) => id === product_id);
    if (index >= 0 && (item_index === undefined || item_index === index))
      return { productId: product_id, code: error.message, context: item.context };
  }
}

function settleFailure(attempt: Attempt, cause: unknown): Failure {
  if (!(cause instanceof Error) || isUncertainMutationError(cause))
    return { kind: "unknown", cause };
  const error = cause as ClientApiError;
  const { status, message } = error;
  if (attempt.kind === "recover")
    return {
      kind: "unknown",
      cause,
      receiptNotFound: status === 404 && message === "create_receipt_not_found",
    };
  if (status === 409 && message === "idempotency_conflict")
    return { kind: "idempotency_conflict", cause };
  const item =
    status === 409 && itemConflictCodes.has(message)
      ? matchItemConflict(error, attempt.intent)
      : undefined;
  // An exact replay checks the receipt before evaluating the original item snapshot.
  if (attempt.kind === "retry" && !item) return { kind: "unknown", cause };
  return { kind: status === 409 ? "conflict" : "rejected", cause, item };
}

function snapshotIntent(farmId: string, products: readonly FarmProduct[]): Intent | undefined {
  if (
    !products.length ||
    products.length > MAX_FARM_PRODUCT_REMOVALS ||
    new Set(products.map(({ product_id }) => product_id)).size !== products.length ||
    new Set(products.map(({ id }) => id)).size !== products.length ||
    products.some(
      ({ farm_id, supply_status, version }) =>
        farm_id !== farmId ||
        supply_status !== "supplying" ||
        !Number.isSafeInteger(version) ||
        version < 1,
    )
  )
    return;
  return Object.freeze({
    products: Object.freeze(products.map((product) => Object.freeze({ ...product }))),
    payload: Object.freeze({
      idempotency_key: crypto.randomUUID(),
      items: Object.freeze(
        products.map(({ product_id, id, version }) =>
          Object.freeze({ product_id, expected_link_id: id, expected_version: version }),
        ),
      ),
    }),
  });
}

export function useFarmProductBulkRemove(farmId: string, onAccessLost?: (cause: unknown) => void) {
  const client = useQueryClient();
  const sessionCurrent = useIsAdminQueryScopeCurrent();
  const record = useAdminRecordScope(farmId);
  const access = useFarmAccess();
  const cache = client.getMutationCache();
  const mutationKey = farmProductBulkRemoveWriteKey(farmId);
  const filters = { mutationKey, exact: true };
  const writeFilters = farmDeleteSupplyWriteFilters(farmId);
  const otherWrites: MutationFilters = {
    ...writeFilters,
    predicate: (entry) => {
      const writer = entry.options.mutationKey?.[mutationKey.length - 1];
      return (
        writer !== "bulk-remove" &&
        (Boolean(writeFilters.predicate?.(entry)) ||
          (writer === "source" &&
            entry.state.status === "error" &&
            !farmAccessDenied(entry.state.error) &&
            isUncertainFarmSupplyWrite(entry.state.error)))
      );
    },
  };
  const otherWriting = useMutationState({ filters: otherWrites, select: () => true }).length > 0;
  const deletionLocked = useFarmDeleteBlocksWrite(farmId);
  const latest = useMutationState({
    filters,
    select: ({ options, state }) => ({
      farm: options.mutationKey?.[1],
      pending: state.status === "pending",
      attempt: state.variables as Attempt | undefined,
      outcome: state.data as Outcome | undefined,
    }),
  }).at(-1);
  const current =
    sessionCurrent() &&
    !access.error &&
    latest?.farm === mutationKey[1] &&
    latest.attempt?.revision === access.revision
      ? latest
      : undefined;
  const pending = Boolean(current?.pending);
  const failure = current?.outcome?.failure ?? (pending ? current?.attempt?.previous : undefined);

  function permitted(revision: number) {
    const state = farmAccess(client);
    return (
      sessionCurrent() && state.revision === revision && !state.error && !isFarmGone(client, farmId)
    );
  }

  const { mutateAsync } = useMutation({
    mutationKey,
    gcTime: Infinity,
    retry: false,
    networkMode: "always",
    mutationFn: async (attempt: Attempt): Promise<Outcome> => {
      const { kind, intent, revision } = attempt;
      if (!permitted(revision)) return {};
      const productIds = intent.payload.items.map(({ product_id }) => product_id);
      try {
        const result =
          kind === "recover"
            ? await recoverFarmProductBulkRemove(farmId, intent.payload)
            : await removeFarmProductsBulk(farmId, intent.payload);
        if (!permitted(revision)) return {};
        invalidateFarmProductLinks(client, farmId, productIds, true);
        return { count: result.removed_count };
      } catch (cause) {
        if (!permitted(revision)) return {};
        if (farmAccessDenied(cause)) {
          retireFarmAccess(client, cause);
          return { denied: cause };
        }
        const failed = settleFailure(attempt, cause);
        if (failed.kind === "conflict" || failed.kind === "idempotency_conflict") {
          invalidateFarmDetail(client, farmId);
          invalidateFarmProductLinks(client, farmId, productIds, false);
        }
        if (kind !== "recover" && farmNotFound(cause)) invalidateFarmDetail(client, farmId);
        return { failure: failed };
      }
    },
  });

  function run(kind: Attempt["kind"], onSuccess: OnSuccess, products?: readonly FarmProduct[]) {
    const currentRecord = record.capture();
    const { revision } = farmAccess(client);
    const previous = cache.findAll(filters).at(-1);
    const previousFailure = (previous?.state.data as Outcome | undefined)?.failure;
    if (
      !currentRecord() ||
      !permitted(revision) ||
      previous?.state.status === "pending" ||
      farmDeleteBlocksWrite(client, farmId) ||
      cache.find(otherWrites)
    )
      return;

    const original = previous?.state.variables as Attempt | undefined;
    const intent =
      kind === "submit"
        ? products && !previousFailure && snapshotIntent(farmId, products)
        : previousFailure?.kind === "unknown" && original?.revision === revision && original.intent;
    if (!intent) return;

    const attempt: Attempt = {
      kind,
      intent,
      revision,
      previous: kind === "submit" ? undefined : previousFailure,
    };
    const operation = mutateAsync(attempt).then((outcome) => {
      const entry = cache.find({
        ...filters,
        predicate: ({ state }) => state.variables === attempt,
      });
      if (!outcome.failure && entry) cache.remove(entry);
      if (!currentRecord()) return;
      if (outcome.count !== undefined && permitted(revision)) onSuccess(outcome.count);
      else if (outcome.denied && farmAccess(client).error === outcome.denied)
        onAccessLost?.(outcome.denied);
    });
    if (previous) cache.remove(previous);
    return operation;
  }

  function clearFailure() {
    const currentRecord = record.capture();
    const previous = cache.findAll(filters).at(-1);
    const outcome = previous?.state.data as Outcome | undefined;
    if (
      currentRecord() &&
      previous &&
      previous.state.status !== "pending" &&
      outcome?.failure &&
      outcome.failure.kind !== "unknown"
    )
      cache.remove(previous);
  }

  return {
    blocked: otherWriting || deletionLocked || Boolean(access.error),
    pending,
    checking: pending && current?.attempt?.kind === "recover",
    unresolved: pending || failure?.kind === "unknown",
    failure,
    intent: current?.attempt?.intent,
    clearFailure,
    submit: (products: readonly FarmProduct[], onSuccess: OnSuccess) =>
      run("submit", onSuccess, products),
    recover: (onSuccess: OnSuccess) => run("recover", onSuccess),
    retry: (onSuccess: OnSuccess) => run("retry", onSuccess),
  };
}
