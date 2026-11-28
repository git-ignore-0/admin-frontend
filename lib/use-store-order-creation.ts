"use client";

import { useState } from "react";

import {
  useAdminRecordScope,
  useIsAdminQueryScopeCurrent,
} from "@/components/admin-query-provider";
import {
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
import type { StoreOrderDraft } from "@/lib/store-order-draft";
import type { StoreProduct } from "@/lib/types";

type Operation = "create" | "recover" | "replay";
type Draft = StoreOrderDraft<StoreProduct>;
type CreationAttempt = { request: StoreOrderCreateInput; draft: Draft; conflictingKey: boolean };
type ConfirmedCreation = { id: string; conflictingKey: boolean };

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
  const { intent, controls } = useAdminMutationIntent<CreationAttempt, ConfirmedCreation>(
    "store-order-create",
    "collection",
  );
  const [issue, setIssue] = useState<unknown>();
  const [operation, setOperation] = useState<Operation>();

  async function run(kind: Operation, payload?: CreationAttempt) {
    const canAct = scope.capture();
    if (!canAct()) return;
    const previous = controls.read();
    if (kind === "replay" && previous?.phase === "unknown" && previous.payload.conflictingKey) {
      return;
    }
    const attempt = controls.begin(payload);
    if (!attempt) return;
    const { request, draft, conflictingKey } = attempt.payload;
    const read = kind === "recover" ? scope.beginRead() : null;
    setIssue(undefined);
    setOperation(kind);
    try {
      const result = read
        ? await recoverAdminStoreOrder(request.idempotency_key, read.signal, read.current)
        : await createAdminStoreOrder(request, canAct);
      const receipt = { ...result, conflictingKey };
      if (!isCurrent() || !controls.settle(attempt, { phase: "confirmed", receipt })) return;
      if (canAct() && !conflictingKey) onConfirmed(receipt.id);
    } catch (error) {
      if (!isCurrent()) return;
      const problem: ClientApiError | undefined = error instanceof Error ? error : undefined;
      const code = problem?.message;
      const conflict = conflictingKey || code === "store_idempotency_conflict";
      // A failed lookup or replay does not fence the original request.
      const result = isProtectedDataError(error)
        ? { phase: "retired" as const }
        : conflict ||
            kind !== "create" ||
            isUncertainMutationError(error) ||
            problem?.status === 499
          ? { phase: "unknown" as const, payload: { request, draft, conflictingKey: conflict } }
          : null;
      if (controls.settle(attempt, result) && canAct()) {
        if (result?.phase === "retired") onAccessDenied();
        else if (!result) onRejected(draft);
        setIssue(error);
      }
    } finally {
      if (canAct()) setOperation(undefined);
    }
  }

  return {
    intent,
    issue,
    operation,
    canEdit: () => scope.capture()() && !controls.read(),
    clearIssue: () => setIssue(undefined),
    create: (request: StoreOrderCreateInput, draft: Draft) =>
      run("create", { request, draft, conflictingKey: false }),
    recover: () => run("recover"),
    replay: () => run("replay"),
    startAnother() {
      if (!scope.capture()() || controls.read()?.phase !== "confirmed") return false;
      controls.clear();
      setIssue(undefined);
      return true;
    },
  };
}
