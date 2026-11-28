"use client";

import {
  notifyManager,
  useMutation,
  useMutationState,
  useQueryClient,
  type MutationFilters,
  type QueryClient,
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
  farmListKey,
  farmNotFound,
  farmProductLinkWriteKey,
  farmSupplyKey,
  isFarmGone,
  retireFarmAccess,
  useFarmAccess,
  useFarmDeleteBlocksWrite,
} from "@/lib/farm-query";
import {
  linkFarmProducts,
  MAX_FARM_PRODUCT_LINKS,
  readdFarmProduct,
  recoverFarmProductLinking,
  recoverFarmProductReadd,
  type FarmProductLinkIntent,
  type FarmProductReaddIntent,
} from "@/lib/farms-api";
import { isUncertainFarmSupplyWrite } from "@/lib/farm-stock";
import type { AvailableFarmProduct, FarmProduct } from "@/lib/types";

type Input =
  | { kind: "link"; products: readonly AvailableFarmProduct[] }
  | { kind: "readd"; source: FarmProduct };
type Intent =
  | { kind: "link"; payload: FarmProductLinkIntent; products: readonly AvailableFarmProduct[] }
  | { kind: "readd"; productId: string; payload: FarmProductReaddIntent };
type Attempt = {
  kind: "submit" | "recover" | "retry";
  intent: Intent;
  revision: number;
  previous?: Failure;
};
type Failure = {
  kind: "unknown" | "idempotency_conflict" | "conflict" | "rejected";
  cause: unknown;
  receiptNotFound?: boolean;
  itemCodes: Record<string, string>;
};
type Outcome = { confirmed?: true; failure?: Failure; denied?: Error };

const linkingConflicts = new Set([
  "product_already_linked",
  "farm_product_removed",
  "product_inactive",
  "product_not_selling",
  "product_not_found",
]);
const readdConflicts = new Set([
  "farm_product_not_removed",
  "farm_product_version_conflict",
  "farm_product_identity_changed",
  "farm_product_changed",
  "product_inactive",
  "product_not_selling",
]);

function settleFailure(attempt: Attempt, cause: unknown): Failure {
  const itemCodes: Record<string, string> = {};
  if (!(cause instanceof Error) || isUncertainMutationError(cause))
    return { kind: "unknown", cause, itemCodes };

  const { status, message, payload } = cause as ClientApiError;
  if (status === 409 && message === "idempotency_conflict")
    return { kind: "idempotency_conflict", cause, itemCodes };

  if (attempt.kind === "recover") {
    return {
      kind: "unknown",
      cause,
      itemCodes,
      receiptNotFound: status === 404 && message === "create_receipt_not_found",
    };
  }

  const { intent } = attempt;
  const missingProduct = status === 404 && message === "not_found";
  const itemConflict =
    intent.kind === "link" && ((status === 409 && linkingConflicts.has(message)) || missingProduct);
  // Known Backend conflicts after an exact replay are evaluated after receipt lookup.
  const revisionConflict = status === 409 && intent.kind === "readd" && readdConflicts.has(message);

  if (itemConflict && intent.kind === "link") {
    const ids = intent.payload.product_ids;
    for (const error of Array.isArray(payload?.errors) ? payload.errors : []) {
      if (
        !isApiObject(error) ||
        typeof error.code !== "string" ||
        !(linkingConflicts.has(error.code) || error.code === "not_found")
      )
        continue;
      const context = error.context;
      if (!isApiObject(context)) continue;
      const index = context.item_index;
      const indexed = typeof index === "number" && Number.isInteger(index) ? ids[index] : undefined;
      const id = typeof context.product_id === "string" ? context.product_id : indexed;
      if (id && (!indexed || indexed === id) && ids.includes(id)) itemCodes[id] = error.code;
    }
    if (!missingProduct && !Object.keys(itemCodes).length) {
      for (const id of ids) itemCodes[id] = message;
    }
  }
  const scopedItemConflict = itemConflict && Object.keys(itemCodes).length > 0;
  if (attempt.kind === "retry" && !scopedItemConflict && !revisionConflict)
    return { kind: "unknown", cause, itemCodes };

  return {
    kind: status === 409 || scopedItemConflict ? "conflict" : "rejected",
    cause,
    itemCodes,
  };
}

function invalidateLinkWrite(
  client: QueryClient,
  farmId: string,
  intent: Intent,
  success: boolean,
) {
  const scope = farmSupplyKey(farmId);
  const ids = new Set(intent.kind === "link" ? intent.payload.product_ids : [intent.productId]);
  notifyManager.batch(() => {
    if (success) {
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
          (["source", "batches", "history"].includes(String(group)) &&
            typeof productId === "string" &&
            ids.has(productId))
        );
      },
    });
  });
}

export function useFarmProductLinkWrite(
  farmId: string,
  productId: string | undefined,
  onAccessLost?: (cause: unknown) => void,
) {
  const client = useQueryClient();
  const sessionCurrent = useIsAdminQueryScopeCurrent();
  const record = useAdminRecordScope(`${farmId}:${productId ?? ""}`);
  const access = useFarmAccess();
  const cache = client.getMutationCache();
  const mutationKey = farmProductLinkWriteKey(farmId, productId);
  const filters = { mutationKey, exact: true };
  const writeFilters = farmDeleteSupplyWriteFilters(farmId);
  const otherWrites: MutationFilters = {
    ...writeFilters,
    predicate: (entry) => {
      const key = entry.options.mutationKey;
      if (
        key?.length === mutationKey.length &&
        mutationKey.every((part, index) => part === key[index])
      )
        return false;
      return (
        Boolean(writeFilters.predicate?.(entry)) ||
        (key?.[writeFilters.mutationKey?.length ?? 0] === "source" &&
          entry.state.status === "error" &&
          !farmAccessDenied(entry.state.error) &&
          isUncertainFarmSupplyWrite(entry.state.error))
      );
    },
  };
  const otherWriting = useMutationState({ filters: otherWrites, select: () => true }).length > 0;
  const deletionLocked = useFarmDeleteBlocksWrite(farmId);
  const latest = useMutationState({
    filters,
    select: ({ state }) => ({
      pending: state.status === "pending",
      attempt: state.variables as Attempt | undefined,
      outcome: state.data as Outcome | undefined,
    }),
  }).at(-1);
  const current =
    sessionCurrent() && !access.error && latest?.attempt?.revision === access.revision
      ? latest
      : undefined;
  const pending = Boolean(current?.pending);
  const failure = current?.outcome?.failure ?? (pending ? current?.attempt?.previous : undefined);

  function permitted(revision: number) {
    const currentAccess = farmAccess(client);
    return (
      sessionCurrent() &&
      currentAccess.revision === revision &&
      !currentAccess.error &&
      !isFarmGone(client, farmId)
    );
  }

  const { mutateAsync } = useMutation({
    mutationKey,
    gcTime: Infinity,
    retry: false,
    networkMode: "always",
    mutationFn: async (attempt: Attempt): Promise<Outcome> => {
      if (!permitted(attempt.revision)) return {};
      const { kind, intent, revision } = attempt;
      try {
        if (intent.kind === "link") {
          if (kind === "recover") await recoverFarmProductLinking(farmId, intent.payload);
          else await linkFarmProducts(farmId, intent.payload);
        } else if (kind === "recover") {
          await recoverFarmProductReadd(farmId, intent.productId, intent.payload);
        } else {
          await readdFarmProduct(farmId, intent.productId, intent.payload);
        }
      } catch (cause) {
        if (!permitted(revision)) return {};
        if (farmAccessDenied(cause)) {
          retireFarmAccess(client, cause);
          return { denied: cause };
        }
        const failed = settleFailure(attempt, cause);
        if (failed.kind === "conflict" || failed.kind === "idempotency_conflict")
          invalidateLinkWrite(client, farmId, intent, false);
        if (kind !== "recover" && !Object.keys(failed.itemCodes).length && farmNotFound(cause)) {
          // Revalidate the parent before retiring it. A re-link may refer to a missing source.
          invalidateFarmDetail(client, farmId);
          invalidateLinkWrite(client, farmId, intent, false);
        }
        return { failure: failed };
      }
      if (!permitted(revision)) return {};
      invalidateLinkWrite(client, farmId, intent, true);
      return { confirmed: true };
    },
  });

  function run(kind: Attempt["kind"], onSuccess: (intent: Intent) => void, input?: Input) {
    const currentRecord = record.capture();
    const { revision } = farmAccess(client);
    const previous = cache.findAll(filters).at(-1);
    if (
      !currentRecord() ||
      !permitted(revision) ||
      previous?.state.status === "pending" ||
      farmDeleteBlocksWrite(client, farmId) ||
      cache.find(otherWrites)
    )
      return;

    const previousFailure = (previous?.state.data as Outcome | undefined)?.failure;
    let intent: Intent;
    if (kind === "submit") {
      if (
        !input ||
        previousFailure?.kind === "unknown" ||
        previousFailure?.kind === "idempotency_conflict"
      )
        return;
      const idempotency_key = crypto.randomUUID();
      if (input.kind === "link") {
        const product_ids = input.products.map(({ id }) => id);
        if (
          productId ||
          !product_ids.length ||
          product_ids.length > MAX_FARM_PRODUCT_LINKS ||
          new Set(product_ids).size !== product_ids.length
        )
          return;
        intent = {
          kind: "link",
          payload: Object.freeze({ idempotency_key, product_ids: Object.freeze(product_ids) }),
          products: Object.freeze(input.products.map((product) => Object.freeze({ ...product }))),
        };
      } else {
        const { source } = input;
        if (source.farm_id !== farmId || source.product_id !== productId) return;
        intent = {
          kind: "readd",
          productId,
          payload: Object.freeze({
            idempotency_key,
            expected_link_id: source.id,
            expected_version: source.version,
            previous_generation: source.supply_generation,
          }),
        };
      }
    } else {
      const original = previous?.state.variables as Attempt | undefined;
      if (previousFailure?.kind !== "unknown" || !original || original.revision !== revision)
        return;
      intent = original.intent;
    }

    const attempt = {
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
      if (outcome.confirmed && permitted(revision)) onSuccess(intent);
      else if (outcome.denied && farmAccess(client).error === outcome.denied)
        onAccessLost?.(outcome.denied);
    });
    if (previous) cache.remove(previous);
    return operation;
  }

  function clearFailure() {
    const previous = cache.findAll(filters).at(-1);
    const outcome = previous?.state.data as Outcome | undefined;
    if (previous?.state.status !== "pending" && outcome?.failure?.kind !== "unknown" && previous)
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
    submit: (input: Input, onSuccess: (intent: Intent) => void) => run("submit", onSuccess, input),
    recover: (onSuccess: (intent: Intent) => void) => run("recover", onSuccess),
    retry: (onSuccess: (intent: Intent) => void) => run("retry", onSuccess),
  };
}

export type FarmProductLinkWrite = ReturnType<typeof useFarmProductLinkWrite>;
