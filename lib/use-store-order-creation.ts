"use client";

import { useEffect, useState } from "react";

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
import type { StoreOrderDraft } from "@/lib/store-order-draft";
import type { StoreProduct } from "@/lib/types";

type Operation = "create" | "recover" | "replay" | "close";
type Draft = StoreOrderDraft<StoreProduct>;
type CreationAttempt = { request: StoreOrderCreateInput; draft: Draft; conflictingKey: boolean };
type CreationOutcome = { id: string; conflictingKey: boolean } | { draft: Draft; issue: unknown };

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
  const { intent, controls } = useAdminMutationIntent<CreationAttempt, CreationOutcome>(
    "store-order-create",
    "collection",
  );
  const [issue, setIssue] = useState<unknown>();
  const [operation, setOperation] = useState<Operation>();

  useEffect(() => {
    if (!scope.capture()() || intent?.phase !== "confirmed" || controls.read() !== intent) return;
    const result = intent.receipt;
    if ("draft" in result) {
      controls.clear();
      onRejected(result.draft);
      setIssue(result.issue);
    } else if (!result.conflictingKey) {
      controls.clear();
      onConfirmed(result.id);
    }
  }, [controls, intent, onConfirmed, onRejected, scope]);

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
        : kind === "close"
          ? await closeAdminStoreOrderCreation(request.idempotency_key, canAct)
          : await createAdminStoreOrder(request, canAct);
      const receipt =
        "closed" in result
          ? { draft, issue: new Error("store_creation_closed") }
          : { ...result, conflictingKey };
      if (isCurrent()) controls.settle(attempt, { phase: "confirmed", receipt });
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
          : { phase: "confirmed" as const, receipt: { draft, issue: error } };
      if (controls.settle(attempt, result) && canAct()) {
        if (result.phase === "retired") onAccessDenied();
        if (result.phase !== "confirmed") setIssue(error);
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
    close: () => run("close"),
    startAnother() {
      if (!scope.capture()() || controls.read()?.phase !== "confirmed") return false;
      controls.clear();
      setIssue(undefined);
      return true;
    },
  };
}
