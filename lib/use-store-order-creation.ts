"use client";

import { useCallback, useEffect, useState } from "react";

import {
  useAdminRecordScope,
  useIsAdminQueryScopeCurrent,
} from "@/components/admin-query-provider";
import {
  closeAdminStoreOrderCreation,
  createAdminStoreOrder,
  recoverAdminStoreOrder,
  type StoreOrderCreateInput,
} from "@/lib/admin-store-order-api";
import { useAdminMutationIntent } from "@/lib/admin-mutation-intent";
import {
  isProtectedDataError,
  isUncertainMutationError,
  type ClientApiError,
} from "@/lib/client-error";
import {
  readStoreOrderRecovery,
  STORE_ORDER_RECOVERY_CHANGED,
  storeOrderRecoverySlot,
  updateStoreOrderRecovery,
  type StoreOrderRecovery,
} from "@/lib/store-order-creation-recovery";
import type { StoreOrderDraft } from "@/lib/store-order-draft";
import type { StoreProduct } from "@/lib/types";

type Operation = "create" | "recover" | "replay" | "close";
type Draft = StoreOrderDraft<StoreProduct>;
type Submission = { request: StoreOrderCreateInput; draft: Draft };
type CreationAttempt = StoreOrderRecovery & { submission?: Submission };
type CreationOutcome =
  | { id: string; key: string; conflictingKey?: true }
  | { editable: true; draft?: Draft; issue: unknown };
type RecoveryState =
  | { status: "loading" }
  | { status: "blocked"; issue: unknown }
  | { status: "ready"; pointer: StoreOrderRecovery | null };

function useCreationIntent() {
  return useAdminMutationIntent<CreationAttempt, CreationOutcome>(
    "store-order-create",
    "collection",
  );
}

/** Only a verified detail read consumes the navigation handoff. */
export function useAcknowledgeStoreOrderCreation(id: string | undefined) {
  const { controls } = useCreationIntent();
  const isCurrent = useIsAdminQueryScopeCurrent();
  useEffect(() => {
    const slot = storeOrderRecoverySlot();
    if (!id || !slot || !navigator.locks || !isCurrent()) return;
    const existing = controls.read();
    if (existing?.phase === "confirmed" && "id" in existing.receipt && existing.receipt.id === id) {
      controls.clear();
    }
    void updateStoreOrderRecovery(slot, (previous) =>
      isCurrent() && previous?.orderId === id ? null : previous,
    ).catch(() => {
      // If storage fails, the pointer stays available for an explicit recovery.
    });
  }, [controls, id, isCurrent]);
}

export function useStoreOrderCreation({
  onConfirmed,
  onRejected,
  onAccessDenied,
}: {
  onConfirmed: (id: string) => void;
  onRejected: (draft: Draft) => void;
  onAccessDenied: () => void;
}) {
  const isCurrent = useIsAdminQueryScopeCurrent();
  const scope = useAdminRecordScope("create-store-order");
  const { intent, controls } = useCreationIntent();
  const [issue, setIssue] = useState<unknown>();
  const [operation, setOperation] = useState<Operation>();
  const [storage, setStorage] = useState<RecoveryState>({ status: "loading" });
  const pointer = storage.status === "ready" ? storage.pointer : null;

  const refreshStorage = useCallback(() => {
    const slot = storeOrderRecoverySlot();
    try {
      if (!slot || !navigator.locks) throw new Error("store_recovery_unavailable");
      setStorage({ status: "ready", pointer: readStoreOrderRecovery(slot) });
    } catch (caught) {
      setStorage({ status: "blocked", issue: caught });
    }
  }, []);

  useEffect(() => {
    refreshStorage();
    function sync(event: StorageEvent) {
      if (event.key === null || event.key === storeOrderRecoverySlot()) refreshStorage();
    }
    window.addEventListener("storage", sync);
    window.addEventListener(STORE_ORDER_RECOVERY_CHANGED, refreshStorage);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(STORE_ORDER_RECOVERY_CHANGED, refreshStorage);
    };
  }, [refreshStorage]);

  useEffect(() => {
    if (!scope.capture()() || intent?.phase !== "confirmed" || controls.read() !== intent) return;
    const result = intent.receipt;
    if ("editable" in result) {
      refreshStorage();
      controls.clear();
      if (result.draft) onRejected(result.draft);
      setIssue(result.issue);
    }
  }, [controls, intent, onRejected, refreshStorage, scope]);

  const unresolved: CreationAttempt | null =
    intent?.phase === "unknown" ? intent.payload : !intent ? pointer : null;
  const draft =
    intent?.phase === "pending" || intent?.phase === "unknown"
      ? intent.payload.submission?.draft
      : intent?.phase === "confirmed" && "editable" in intent.receipt
        ? intent.receipt.draft
        : undefined;

  async function run(kind: Operation, submission?: Submission) {
    const canAct = scope.capture();
    const slot = storeOrderRecoverySlot();
    if (!canAct() || !slot || storage.status !== "ready") return;

    const existing = controls.read();
    const candidate = existing?.phase === "unknown" ? existing.payload : unresolved;
    if (kind === "create" && (!submission || candidate || existing)) return;
    if (kind !== "create" && !candidate) return;
    if (kind === "replay" && (!candidate?.submission || candidate.conflictingKey)) return;
    if (kind === "close" && candidate?.conflictingKey) return;

    const attempt = controls.begin(
      submission
        ? { key: submission.request.idempotency_key, submission }
        : existing?.phase === "unknown"
          ? undefined
          : (candidate ?? undefined),
    );
    if (!attempt) return;
    const { key, conflictingKey, submission: saved } = attempt.payload;
    setIssue(undefined);
    setOperation(kind);

    if (kind === "create") {
      try {
        const reserved = { key };
        const current = await updateStoreOrderRecovery(
          slot,
          (previous) => previous ?? (canAct() ? reserved : null),
        );
        if (canAct()) setStorage({ status: "ready", pointer: current });
        if (current !== reserved || !canAct()) {
          controls.settle(attempt, null);
          if (canAct()) setOperation(undefined);
          return;
        }
      } catch (caught) {
        controls.settle(attempt, null);
        if (canAct()) {
          setStorage({ status: "blocked", issue: caught });
          setOperation(undefined);
        }
        return;
      }
    }

    const read = kind === "recover" ? scope.beginRead() : null;
    const updatePointer = async (
      resolve: (previous: StoreOrderRecovery) => StoreOrderRecovery | null,
    ) => {
      try {
        const current = await updateStoreOrderRecovery(slot, (previous) =>
          isCurrent() && previous?.key === key ? resolve(previous) : previous,
        );
        if (canAct()) setStorage({ status: "ready", pointer: current });
      } catch (caught) {
        if (canAct()) setStorage({ status: "blocked", issue: caught });
      }
    };
    try {
      const result = read
        ? await recoverAdminStoreOrder(key, read.signal, read.current)
        : kind === "close"
          ? await closeAdminStoreOrderCreation(key, canAct)
          : saved && (await createAdminStoreOrder(saved.request, canAct));
      if (!result || !isCurrent()) return;

      if ("closed" in result) {
        await updatePointer(() => null);
        if (isCurrent()) {
          controls.settle(attempt, {
            phase: "confirmed",
            receipt: {
              editable: true,
              draft: saved?.draft,
              issue: new Error(saved ? "store_creation_closed" : "store_recovered_request_closed"),
            },
          });
        }
      } else {
        const receipt = { ...result, key, conflictingKey };
        await updatePointer((previous) => ({ ...previous, orderId: result.id }));
        if (isCurrent() && controls.settle(attempt, { phase: "confirmed", receipt })) {
          // Reloaded and remounted screens show the verified link without navigating unexpectedly.
          if (canAct() && saved && !conflictingKey) onConfirmed(result.id);
        }
      }
    } catch (error) {
      if (!isCurrent()) return;
      const problem: ClientApiError | undefined = error instanceof Error ? error : undefined;
      if (isProtectedDataError(error)) {
        if (controls.settle(attempt, { phase: "retired" }) && canAct()) onAccessDenied();
        return;
      }
      const conflict = conflictingKey || problem?.message === "store_idempotency_conflict";
      // A failed lookup or replay does not fence the original request.
      if (
        conflict ||
        kind !== "create" ||
        isUncertainMutationError(error) ||
        problem?.status === 499
      ) {
        if (conflict && !conflictingKey) {
          await updatePointer((previous) => ({ ...previous, conflictingKey: true }));
        }
        if (
          isCurrent() &&
          controls.settle(attempt, {
            phase: "unknown",
            payload: { ...attempt.payload, conflictingKey: conflict ? true : undefined },
          }) &&
          canAct()
        ) {
          setIssue(error);
        }
      } else {
        await updatePointer(() => null);
        if (isCurrent()) {
          controls.settle(attempt, {
            phase: "confirmed",
            receipt: { editable: true, draft: saved?.draft, issue: error },
          });
        }
      }
    } finally {
      if (canAct()) setOperation(undefined);
    }
  }

  return {
    intent,
    draft,
    unresolved,
    issue,
    operation,
    storage,
    refreshStorage,
    canEdit: () => scope.capture()() && !controls.read() && !pointer,
    canSubmit: () =>
      storage.status === "ready" && scope.capture()() && !controls.read() && !pointer,
    clearIssue: () => setIssue(undefined),
    create: (request: StoreOrderCreateInput, draft: Draft) => run("create", { request, draft }),
    recover: () => run("recover"),
    replay: () => run("replay"),
    close: () => run("close"),
    async startAnother() {
      const canAct = scope.capture();
      const slot = storeOrderRecoverySlot();
      const current = controls.read();
      if (!slot || !canAct() || current?.phase !== "confirmed" || !("id" in current.receipt))
        return false;
      const { key } = current.receipt;
      try {
        const pointer = await updateStoreOrderRecovery(slot, (previous) =>
          canAct() && previous?.key === key ? null : previous,
        );
        if (!canAct() || controls.read() !== current) return false;
        setStorage({ status: "ready", pointer });
        controls.clear();
        setIssue(undefined);
        return true;
      } catch (caught) {
        if (canAct()) setStorage({ status: "blocked", issue: caught });
        return false;
      }
    },
  };
}
