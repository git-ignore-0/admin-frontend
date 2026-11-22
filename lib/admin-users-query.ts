"use client";

import { hashKey, useQuery, useQueryClient } from "@tanstack/react-query";
import { useIsAdminQueryScopeCurrent } from "@/components/admin-query-provider";
import {
  requireAdminUserDetail,
  requireAdminUserRecord,
  requireInvitedUserRecord,
} from "@/lib/admin-users";
import { requirePaginatedList, requireResponseList } from "@/lib/api-response";
import { apiEnvelope } from "@/lib/client-api";
import type { ClientApiError } from "@/lib/client-error";
import type { AdminUserDetail, AdminUserListItem, PaginationMeta } from "@/lib/types";

export const adminUserStatuses = [
  "pending_activation",
  "active",
  "suspended",
  "deletion_requested",
  "anonymized",
] as const;
type AdminUserStatus = "" | (typeof adminUserStatuses)[number];
type ListContext = { search: string; status: AdminUserStatus; page: number };
type SearchReader = Pick<URLSearchParams, "get">;
const usersKey = ["users"] as const;
const listKey = [...usersKey, "list"] as const;
const userKey = (id: string) => [...usersKey, "detail", id] as const;

export function readAdminUsersListContext(params: SearchReader): ListContext {
  const search = (params.get("search") ?? "").trim();
  const status = adminUserStatuses.find((value) => params.get("status") === value) ?? "";
  const page = Number(params.get("page"));
  return { search, status, page: Number.isSafeInteger(page) && page > 0 ? page : 1 };
}

function usersListSearch({ search, status, page }: ListContext) {
  const parameters = new URLSearchParams();
  if (search) parameters.set("search", search);
  if (status) parameters.set("status", status);
  if (page > 1) parameters.set("page", String(page));
  const value = parameters.toString();
  return value ? `?${value}` : "";
}

export function adminUsersListHref(params: SearchReader) {
  return "/users" + usersListSearch(readAdminUsersListContext(params));
}

export function adminUserHref(id: string, context: ListContext) {
  return `/users/${encodeURIComponent(id)}${usersListSearch(context)}`;
}

export async function fetchAdminUsers(
  { page, search, status = "" }: { page: number; search: string; status?: AdminUserStatus },
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({ page: String(page), search });
  if (status) params.set("status", status);
  return requirePaginatedList(
    await apiEnvelope<AdminUserListItem[], PaginationMeta>(`admin/users?${params}`, { signal }),
    requireAdminUserRecord,
  );
}

function isAccessDenied(error: unknown) {
  if (!(error instanceof Error)) return false;
  const { status } = error as ClientApiError;
  return status === 403 || status === 401 || error.message === "session_changed";
}

function useAdminUsersRead<T>(key: readonly unknown[], read: (signal: AbortSignal) => Promise<T>) {
  const client = useQueryClient();
  const isCurrent = useIsAdminQueryScopeCurrent();
  const denied = { accessDenied: true } as const;
  const query = useQuery<{ payload: T } | typeof denied>({
    queryKey: key,
    queryFn: async ({ signal }) => {
      try {
        return { payload: await read(signal) };
      } catch (error) {
        if (!isAccessDenied(error) || signal.aborted || !isCurrent()) throw error;

        // Both directory and detail reads require the same Core admin grant. Clear
        // cached projections and cancel other reads before they can restore old data.
        const currentHash = hashKey(key);
        void client.cancelQueries({
          queryKey: usersKey,
          predicate: (candidate) => candidate.queryHash !== currentHash,
        });
        client.setQueriesData({ queryKey: usersKey }, denied);
        return denied;
      }
    },
  });
  return {
    data: query.data && "payload" in query.data ? query.data.payload : undefined,
    accessDenied: query.data !== undefined && "accessDenied" in query.data,
    waitingForConnection: query.fetchStatus === "paused",
    error: query.error,
    isPending: query.isPending,
    isFetching: query.isFetching,
    refetch: query.refetch,
  };
}

export function useAdminUsersList(context: ListContext) {
  return useAdminUsersRead([...listKey, context], (signal) => fetchAdminUsers(context, signal));
}

export function useAdminUserDetail(userId: string, invitedPage: number) {
  return useAdminUsersRead([...userKey(userId), invitedPage], async (signal) => {
    const result = await apiEnvelope<AdminUserDetail, { invited: PaginationMeta }>(
      `admin/users/${encodeURIComponent(userId)}?invited_page=${invitedPage}`,
      { signal },
    );
    requireAdminUserDetail(result.data, userId);
    requireResponseList(result.data.invited_users, requireInvitedUserRecord);
    if (result.meta?.invited !== undefined) {
      requirePaginatedList({ data: result.data.invited_users, meta: result.meta.invited });
    }
    return result;
  });
}

export function useRefreshAdminUsers() {
  const client = useQueryClient();
  return async (id?: string) => {
    await Promise.all([
      client.invalidateQueries({ queryKey: listKey }),
      ...(id ? [client.invalidateQueries({ queryKey: userKey(id) })] : []),
    ]);
  };
}
