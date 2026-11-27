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
import {
  apiErrorFields,
  isApiObject,
  isUncertainMutationError,
  type ClientApiError,
} from "@/lib/client-error";
import { invalidateFarmDetail } from "@/lib/farm-detail-snapshot";
import {
  farmAccess,
  farmAccessDenied,
  farmBulkDraftKey,
  farmBulkWriteKey,
  farmDeleteBlocksWrite,
  farmDeleteSupplyWriteFilters,
  farmListKey,
  farmSupplyKey,
  isFarmGone,
  retireFarmAccess,
  useFarmAccess,
  useFarmDeleteBlocksWrite,
} from "@/lib/farm-query";
import { isUncertainFarmSupplyWrite } from "@/lib/farm-stock";
import { postFarmBulkSupply, recoverFarmBulkSupply, type FarmBulkIntent } from "@/lib/farms-api";

type BulkInput = Omit<FarmBulkIntent, "idempotency_key">;
type BulkFailure = {
  kind: "unknown" | "idempotency_conflict" | "conflict" | "rejected";
  cause: unknown;
  intent: FarmBulkIntent;
  fieldErrors: Partial<Record<"start_date" | "end_date", string>>;
  itemErrors: Record<string, string>;
  itemCodes: Record<string, string>;
  receiptNotFound?: boolean;
};
type Attempt =
  | { kind: "submit"; intent: FarmBulkIntent; revision: number }
  | { kind: "recover" | "retry"; intent: FarmBulkIntent; revision: number; previous: BulkFailure };
type Outcome = { confirmed?: true; failure?: BulkFailure; denied?: Error };
type OnSuccess = (intent: FarmBulkIntent) => void;

const sourceConflictCodes = new Set([
  "farm_product_version_conflict",
  "farm_product_identity_changed",
  "farm_product_changed",
  "farm_product_removed",
  "product_not_selling",
]);

function validationMessage(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (Array.isArray(value)) return value.find((text) => typeof text === "string" && text.trim());
}

function describeFailure(intent: FarmBulkIntent, cause: unknown): BulkFailure {
  const failure: BulkFailure = {
    kind: "unknown",
    cause,
    intent,
    fieldErrors: {},
    itemErrors: {},
    itemCodes: {},
  };
  if (!(cause instanceof Error) || isUncertainMutationError(cause)) return failure;
  const { status, message, payload } = cause as ClientApiError;

  if (status === 409 && message === "idempotency_conflict") {
    failure.kind = "idempotency_conflict";
  } else if (status === 409 && sourceConflictCodes.has(message)) {
    failure.kind = "conflict";
    for (const error of Array.isArray(payload?.errors) ? payload.errors : []) {
      if (
        !isApiObject(error) ||
        typeof error.code !== "string" ||
        !sourceConflictCodes.has(error.code)
      )
        continue;
      const context = error.context;
      if (!isApiObject(context)) continue;
      const indexed =
        typeof context.item_index === "number" && Number.isInteger(context.item_index)
          ? intent.items[context.item_index]?.product_id
          : undefined;
      const productId = context.product_id ?? indexed;
      if (
        typeof productId === "string" &&
        (!indexed || indexed === productId) &&
        intent.items.some((item) => item.product_id === productId)
      ) {
        failure.itemCodes[productId] = error.code;
      }
    }
  } else if (status === 400 || message === "csrf_rejected") {
    failure.kind = "rejected";
    const fields: Record<string, unknown> = {
      ...(isApiObject(payload) ? payload : {}),
      ...apiErrorFields(cause),
    };
    for (const field of ["start_date", "end_date"] as const) {
      const error = validationMessage(fields[field]);
      if (error) failure.fieldErrors[field] = error;
    }
    intent.items.forEach(({ product_id }, index) => {
      const item = fields.items;
      const errors = isApiObject(item)
        ? item[String(index)]
        : Array.isArray(item)
          ? item[index]
          : null;
      if (!isApiObject(errors)) return;
      const error =
        validationMessage(errors.quantity_units) ??
        Object.values(errors).map(validationMessage).find(Boolean);
      if (error) failure.itemErrors[product_id] = error;
    });
  }
  return failure;
}

function settleFailure(attempt: Attempt, cause: unknown): BulkFailure {
  const failure = describeFailure(attempt.intent, cause);
  if (attempt.kind === "submit" || failure.kind === "idempotency_conflict") return failure;
  // POST checks the receipt before locking and testing source revisions. A stale link or
  // version proves the original attempt did not commit and can no longer pass that guard.
  if (
    attempt.kind === "retry" &&
    failure.kind === "conflict" &&
    Object.values(failure.itemCodes).some(
      (code) =>
        code === "farm_product_version_conflict" || code === "farm_product_identity_changed",
    )
  )
    return failure;
  // A rejection of the latest request alone cannot settle an earlier uncertain attempt.
  const { status, message } = (cause ?? {}) as ClientApiError;
  const receiptNotFound =
    attempt.kind === "recover" && status === 404 && message === "create_receipt_not_found";
  return { ...failure, kind: "unknown", receiptNotFound };
}

function invalidateBulkWrite(client: QueryClient, farmId: string, intent: FarmBulkIntent) {
  const scope = farmSupplyKey(farmId);
  const productIds = new Set(intent.items.map((item) => item.product_id));
  notifyManager.batch(() => {
    client.removeQueries({ queryKey: farmBulkDraftKey(farmId), exact: true });
    invalidateFarmDetail(client, farmId);
    void client.invalidateQueries({ queryKey: farmListKey });
    void client.invalidateQueries({
      queryKey: scope,
      predicate: ({ queryKey }) => {
        const group = queryKey[scope.length];
        const productId = queryKey[scope.length + 1];
        return (
          group === "list" ||
          group === "eligible" ||
          ((group === "source" || group === "batches" || group === "history") &&
            typeof productId === "string" &&
            productIds.has(productId))
        );
      },
    });
  });
}

export function useFarmBulkWrite(farmId: string, onAccessLost?: (cause: unknown) => void) {
  const client = useQueryClient();
  const currentSession = useIsAdminQueryScopeCurrent();
  const record = useAdminRecordScope(farmId);
  const access = useFarmAccess();
  const cache = client.getMutationCache();
  const mutationKey = farmBulkWriteKey(farmId);
  const filters = { mutationKey, exact: true };
  const supplyFilters = farmDeleteSupplyWriteFilters(farmId);
  const otherWrites: MutationFilters = {
    ...supplyFilters,
    predicate: (entry) => {
      const writer = entry.options.mutationKey?.[mutationKey.length - 1];
      return (
        writer !== "bulk" &&
        (supplyFilters.predicate?.(entry) ||
          (writer === "source" &&
            entry.state.status === "error" &&
            !farmAccessDenied(entry.state.error) &&
            isUncertainFarmSupplyWrite(entry.state.error)))
      );
    },
  };
  const otherWriting = useMutationState({ filters: otherWrites, select: () => true }).length > 0;
  const deletionLocked = useFarmDeleteBlocksWrite(farmId);
  const states = useMutationState({
    filters,
    select: ({ state }) => ({
      status: state.status,
      attempt: state.variables as Attempt | undefined,
      outcome: state.data as Outcome | undefined,
    }),
  });
  const latest = states.at(-1);
  const visible =
    currentSession() && !access.error && latest?.attempt?.revision === access.revision
      ? latest
      : undefined;
  const inFlight = visible?.status === "pending";
  const failure =
    inFlight && visible.attempt?.kind !== "submit"
      ? visible.attempt?.previous
      : visible?.outcome?.failure;

  function permitted(revision: number) {
    const current = farmAccess(client);
    return (
      currentSession() &&
      current.revision === revision &&
      !current.error &&
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
      const { intent } = attempt;
      try {
        if (attempt.kind === "recover") await recoverFarmBulkSupply(farmId, intent);
        else await postFarmBulkSupply(farmId, intent);
      } catch (cause) {
        if (!permitted(attempt.revision)) return {};
        if (farmAccessDenied(cause)) {
          retireFarmAccess(client, cause);
          return { denied: cause };
        }
        return { failure: settleFailure(attempt, cause) };
      }
      if (!permitted(attempt.revision)) return {};
      invalidateBulkWrite(client, farmId, intent);
      return { confirmed: true };
    },
  });

  function run(kind: "submit" | "recover" | "retry", onSuccess: OnSuccess, input?: BulkInput) {
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

    let attempt: Attempt;
    if (kind === "submit") {
      if (
        !input ||
        previousFailure?.kind === "unknown" ||
        previousFailure?.kind === "conflict" ||
        previousFailure?.kind === "idempotency_conflict"
      )
        return;
      const intent = Object.freeze({
        idempotency_key: crypto.randomUUID(),
        start_date: input.start_date,
        end_date: input.end_date,
        items: Object.freeze(input.items.map((item) => Object.freeze({ ...item }))),
      });
      attempt = { kind, intent, revision };
    } else {
      if (previousFailure?.kind !== "unknown") return;
      attempt = { kind, intent: previousFailure.intent, previous: previousFailure, revision };
    }

    const operation = mutateAsync(attempt).then((outcome) => {
      const entry = cache.find({
        ...filters,
        predicate: ({ state }) => state.variables === attempt,
      });
      if (!outcome.confirmed && !outcome.failure && entry) cache.remove(entry);
      if (!currentRecord()) return;
      if (outcome.confirmed && permitted(revision)) {
        if (entry) cache.remove(entry);
        onSuccess(attempt.intent);
      } else if (outcome.denied && farmAccess(client).error === outcome.denied) {
        onAccessLost?.(outcome.denied);
      }
    });
    if (previous) cache.remove(previous);
    return operation;
  }

  function clearResult(kind: "confirmed" | "failure") {
    const entry = cache.findAll(filters).at(-1);
    if (!entry || entry.state.status === "pending") return;
    const outcome = entry.state.data as Outcome | undefined;
    const clear =
      kind === "confirmed"
        ? outcome?.confirmed
        : outcome?.failure && outcome.failure.kind !== "unknown";
    if (clear) cache.remove(entry);
  }

  return {
    blocked: otherWriting || deletionLocked || Boolean(access.error),
    locked: inFlight || failure?.kind === "unknown" || failure?.kind === "idempotency_conflict",
    pending: inFlight && visible.attempt?.kind !== "recover",
    checking: inFlight && visible.attempt?.kind === "recover",
    failure,
    intent: inFlight || failure ? visible?.attempt?.intent : undefined,
    confirmedIntent: visible?.outcome?.confirmed ? visible.attempt?.intent : undefined,
    acknowledgeSuccess: () => clearResult("confirmed"),
    resetFailure: () => clearResult("failure"),
    submit: (input: BulkInput, onSuccess: OnSuccess) => run("submit", onSuccess, input),
    recover: (onSuccess: OnSuccess) => run("recover", onSuccess),
    retry: (onSuccess: OnSuccess) => run("retry", onSuccess),
  };
}
