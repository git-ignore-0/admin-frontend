"use client";

import {
  CancelledError,
  hashKey,
  skipToken,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useIsAdminQueryScopeCurrent } from "@/components/admin-query-provider";
import {
  requireAdminUserDetail,
  requireAdminUserRecord,
  requireInvitedUserRecord,
} from "@/lib/admin-users";
import { requirePaginatedList, requireResponseList } from "@/lib/api-response";
import { apiEnvelope } from "@/lib/client-api";
import type { ClientApiError } from "@/lib/client-error";
import type {
  AdminUserDetail,
  AdminUserListItem,
  PaginationMeta,
  UserShippingAddress,
} from "@/lib/types";

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
const accessKey = ["users-access"] as const;
type UsersAccess = { status: "granted" | "denied"; revision: number };
type UsersSnapshot<T> = { payload: T; accessRevision: number };
const denied = { accessDenied: true } as const;
type UsersCache<T> = UsersSnapshot<T> | typeof denied;

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

function useAdminUsersAccess() {
  return useQuery<UsersAccess>({ queryKey: accessKey, queryFn: skipToken, gcTime: Infinity }).data;
}

export function useAdminUsersMutationAccess() {
  const client = useQueryClient();
  const isCurrent = useIsAdminQueryScopeCurrent();
  const access = useAdminUsersAccess();
  return {
    canMutate: isCurrent() && access?.status === "granted",
    captureMutationAccess() {
      const current = client.getQueryData<UsersAccess>(accessKey);
      if (!isCurrent() || current?.status !== "granted") return;
      return () => {
        const latest = client.getQueryData<UsersAccess>(accessKey);
        return isCurrent() && latest?.status === "granted" && latest.revision === current.revision;
      };
    },
  };
}

function useAdminUsersRead<T>(
  key: readonly unknown[],
  read: (signal: AbortSignal) => Promise<T>,
  retain?: (snapshot: UsersSnapshot<T>) => void,
) {
  const client = useQueryClient();
  const isCurrent = useIsAdminQueryScopeCurrent();
  const access = useAdminUsersAccess();
  const accessRevision = access?.revision ?? 0;
  const query = useQuery<UsersCache<T>>({
    queryKey: key,
    queryFn: async ({ signal }) => {
      const revision = client.getQueryData<UsersAccess>(accessKey)?.revision ?? 0;
      const current = () =>
        !signal.aborted &&
        isCurrent() &&
        (client.getQueryData<UsersAccess>(accessKey)?.revision ?? 0) === revision;
      try {
        const payload = await read(signal);
        if (!current()) throw new CancelledError();
        if (client.getQueryData<UsersAccess>(accessKey)?.status !== "granted") {
          client.setQueryData<UsersAccess>(accessKey, { status: "granted", revision });
        }
        const snapshot = { payload, accessRevision: revision };
        retain?.(snapshot);
        return snapshot;
      } catch (error) {
        if (!isAccessDenied(error) || !current()) throw error;

        // The Core admin permission is shared by all Users list and detail reads.
        client.setQueryData<UsersAccess>(accessKey, { status: "denied", revision: revision + 1 });
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
  const accessDenied =
    !isCurrent() ||
    access?.status === "denied" ||
    (query.data !== undefined && "accessDenied" in query.data);
  return {
    data:
      !accessDenied &&
      query.data &&
      "payload" in query.data &&
      query.data.accessRevision === accessRevision
        ? query.data.payload
        : undefined,
    accessDenied,
    accessRevision,
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

type UserDetailSummary = {
  data: Omit<AdminUserDetail, "invited_users">;
  meta: { invited: PaginationMeta } | undefined;
};

export function useAdminUserDetail(userId: string, invitedPage: number) {
  const client = useQueryClient();
  const summaryKey = [...userKey(userId), "summary"];
  const summary = useQuery<UsersCache<UserDetailSummary>>({
    queryKey: summaryKey,
    queryFn: skipToken,
  }).data;
  const query = useAdminUsersRead(
    [...userKey(userId), invitedPage],
    async (signal) => {
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
    },
    ({ payload, accessRevision }) => {
      const data: Omit<AdminUserDetail, "invited_users"> & { invited_users?: unknown } = {
        ...payload.data,
      };
      delete data.invited_users;
      const snapshot: UsersSnapshot<UserDetailSummary> = {
        payload: { data, meta: payload.meta },
        accessRevision,
      };
      client.setQueryData<UsersCache<UserDetailSummary>>(summaryKey, snapshot);
    },
  );
  return {
    ...query,
    summary:
      !query.accessDenied &&
      summary &&
      "payload" in summary &&
      summary.accessRevision === query.accessRevision
        ? summary.payload
        : undefined,
    applyShippingAddress(saved: UserShippingAddress, expectedVersion: string | null) {
      const latest = client.getQueryData<UsersCache<UserDetailSummary>>(summaryKey);
      if (
        !latest ||
        !("payload" in latest) ||
        latest.accessRevision !== query.accessRevision ||
        latest.payload.data.can_edit_shipping_address !== true
      )
        return;

      // A concurrent read may already have a newer address than this write response.
      const latestVersion = latest.payload.data.shipping_address?.updated_at ?? null;
      if (latestVersion !== expectedVersion && latestVersion !== saved.updated_at) return;

      client.setQueriesData<UsersCache<UserDetailSummary>>(
        { queryKey: userKey(userId) },
        (cached) => {
          if (
            !cached ||
            !("payload" in cached) ||
            cached.accessRevision !== latest.accessRevision ||
            cached.payload.data.can_edit_shipping_address !== true
          )
            return cached;
          return {
            ...cached,
            payload: {
              ...cached.payload,
              data: { ...cached.payload.data, shipping_address: saved },
            },
          };
        },
      );
    },
  };
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
