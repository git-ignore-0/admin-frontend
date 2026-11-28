"use client";

import { useMutation, useMutationState, useQueryClient } from "@tanstack/react-query";

import { useIsAdminQueryScopeCurrent } from "@/components/admin-query-provider";
import { apiErrorContext, type ClientApiError } from "@/lib/client-error";
import {
  captureFarmDetail,
  publishFarmDetail,
  verifiedFarmDetail,
} from "@/lib/farm-detail-snapshot";
import {
  confirmFarmGone,
  farmAccess,
  farmAccessDenied,
  farmDeleteFilters,
  farmDeleteSupplyWriteFilters,
  farmDetailWritePending,
  farmFarmerLinkBlocksDelete,
  farmNotFound,
  isFarmGone,
  retireFarmAccess,
} from "@/lib/farm-query";
import { deleteFarm, farmDeleteCapability, getFarm, parseFarmDeleteReasons } from "@/lib/farms-api";
import type { FarmDeleteReason } from "@/lib/types";

type DeleteRejection = {
  code: "farm_in_use" | "farm_product_changed" | "farm_delete_protected";
  reasons?: FarmDeleteReason[];
};
type DeleteIssue = {
  verification?: "verified" | "failed";
} & (
  | { kind: "uncertain"; rejection?: DeleteRejection }
  | { kind: "rejected"; rejection: DeleteRejection }
);
type DeleteAttempt =
  { kind: "delete"; priorUncertain: boolean } | { kind: "verify"; issue: DeleteIssue };
type DeleteResult = { issue?: DeleteIssue; rejection?: unknown };

function rejection(cause: unknown): DeleteRejection | undefined {
  const { status, message } = (cause ?? {}) as ClientApiError;
  if (status !== 409) return;
  if (message === "farm_in_use") {
    const reasons = parseFarmDeleteReasons(apiErrorContext<{ reasons?: unknown }>(cause)?.reasons);
    return { code: message, reasons: reasons?.length ? reasons : undefined };
  }
  if (message === "farm_product_changed" || message === "farm_delete_protected") {
    return { code: message };
  }
}

function mayConfirmAgain(issue: DeleteIssue | undefined) {
  return (
    issue?.kind === "uncertain" &&
    issue.verification === "verified" &&
    issue.rejection?.code !== "farm_delete_protected"
  );
}

function uncertain(cause: unknown) {
  const { status, message } = (cause ?? {}) as ClientApiError;
  return (
    !status ||
    status === 408 ||
    status === 404 ||
    status >= 500 ||
    message === "invalid_response" ||
    message === "request_timeout"
  );
}

export function useFarmDeletion(farmId: string) {
  const client = useQueryClient();
  const isCurrent = useIsAdminQueryScopeCurrent();
  const cache = client.getMutationCache();
  const filters = farmDeleteFilters(farmId);
  const states = useMutationState<{
    status: string;
    attempt?: DeleteAttempt;
    result?: DeleteResult;
  }>({
    filters,
    select: ({ state }) => ({
      status: state.status,
      attempt: state.variables as DeleteAttempt | undefined,
      result: state.data as DeleteResult | undefined,
    }),
  });
  const latest = states.at(-1);
  const pending = latest?.status === "pending";
  const issue =
    latest?.attempt?.kind === "verify" && pending ? latest.attempt.issue : latest?.result?.issue;

  const { mutateAsync } = useMutation({
    mutationKey: filters.mutationKey,
    gcTime: Infinity,
    mutationFn: async (attempt: DeleteAttempt): Promise<DeleteResult> => {
      const { revision } = farmAccess(client);
      const permitted = () =>
        isCurrent() &&
        farmAccess(client).revision === revision &&
        !farmAccess(client).error &&
        !isFarmGone(client, farmId);
      const acceptError = (cause: unknown) => {
        if (!isCurrent()) return false;
        if (farmAccessDenied(cause)) retireFarmAccess(client, cause);
        if (!permitted()) return false;
        if (farmNotFound(cause)) {
          confirmFarmGone(client, farmId);
          return false;
        }
        return true;
      };
      if (!permitted()) return {};
      let check: DeleteIssue;
      if (attempt.kind === "verify") check = attempt.issue;
      else {
        try {
          await deleteFarm(farmId);
          if (permitted()) confirmFarmGone(client, farmId);
          return {};
        } catch (cause) {
          if (!acceptError(cause)) return {};
          const rejected = rejection(cause);
          if (!rejected) {
            return uncertain(cause) || attempt.priorUncertain
              ? { issue: { kind: "uncertain" } }
              : { rejection: cause };
          }
          // A definite result for a new request cannot settle an earlier request.
          check = { kind: attempt.priorUncertain ? "uncertain" : "rejected", rejection: rejected };
        }
      }

      const before = captureFarmDetail(client, farmId);
      try {
        const snapshot = await getFarm(farmId);
        if (!permitted()) return {};
        const verified = publishFarmDetail(client, snapshot, before, "read");
        const capability = farmDeleteCapability(verified?.capabilities);
        return capability &&
          check.kind === "rejected" &&
          check.rejection.code !== "farm_delete_protected"
          ? {}
          : { issue: { ...check, verification: capability ? "verified" : "failed" } };
      } catch (cause) {
        return acceptError(cause) ? { issue: { ...check, verification: "failed" } } : {};
      }
    },
  });

  function run(kind: DeleteAttempt["kind"]) {
    const previous = cache.findAll(filters).at(-1);
    if (
      previous?.state.status === "pending" ||
      isFarmGone(client, farmId) ||
      !isCurrent() ||
      farmAccess(client).error ||
      farmDetailWritePending(client, farmId)
    )
      return;
    const oldIssue = (previous?.state.data as DeleteResult | undefined)?.issue;
    let attempt: DeleteAttempt;
    if (kind === "verify") {
      if (!oldIssue) return;
      attempt = { kind, issue: oldIssue };
    } else {
      if (
        farmDeleteCapability(verifiedFarmDetail(client, farmId)?.capabilities)?.allowed !== true ||
        cache.find(farmDeleteSupplyWriteFilters(farmId)) ||
        farmFarmerLinkBlocksDelete(client, farmId) ||
        (oldIssue && !mayConfirmAgain(oldIssue))
      )
        return;
      attempt = { kind, priorUncertain: oldIssue?.kind === "uncertain" };
    }
    const operation = mutateAsync(attempt).then((result) => {
      if (!result.issue) {
        const entry = cache.find({
          ...filters,
          predicate: (row) => row.state.variables === attempt,
        });
        if (entry) cache.remove(entry);
      }
      return result;
    });
    if (previous) cache.remove(previous);
    return operation;
  }

  return { pending, issue, mayConfirmAgain: mayConfirmAgain(issue), run };
}
