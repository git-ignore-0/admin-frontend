"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ApiEnvelope } from "@/lib/client-api";
import { isProtectedDataError, isRequestCanceled } from "@/lib/client-error";
import {
  listStoreOrders,
  storeOrderStatusQuery,
  storeOrderHasDeadline,
  storeDeadlineRemainingMs,
  type StoreOrderDisplayStatus,
} from "@/lib/store-orders";
import type { PaginationMeta, StoreOrder, StoreOrderSort, StorePaymentStatus } from "@/lib/types";

type OrderPage = ApiEnvelope<StoreOrder[], PaginationMeta> & { receivedAt: number };
const MAX_CACHED_PAGES = 24;

/** Cache belongs to this mounted list; explicit reload invalidates every tab. */
export function useStoreOrderList({
  search,
  sort,
  status,
  paymentStatus,
  getErrorMessage,
}: {
  search: string;
  sort: StoreOrderSort;
  status: StoreOrderDisplayStatus | "";
  paymentStatus: StorePaymentStatus | "";
  getErrorMessage: (error: unknown) => string;
}) {
  const [page, setPage] = useState(1);
  const [cache, setCache] = useState<Map<string, OrderPage>>(() => new Map());
  const [failure, setFailure] = useState<{ key?: string; message: string } | null>(null);
  const [refreshKey, setRefreshKey] = useState<string | null>(null);
  const requestId = useRef(0);
  const expiredReloads = useRef(new Set<string>());
  const denied = failure !== null && failure.key === undefined;
  const key = JSON.stringify([search, sort, status, paymentStatus, page]);
  const failedCurrentPage = failure?.key === key;
  const allKey = JSON.stringify([search, sort, "", "", 1]);
  const payload = useMemo(() => {
    const exact = cache.get(key);
    if (exact) return exact;
    const all = cache.get(allKey);
    // A partial server page must never be mistaken for the whole collection.
    if (
      (!status && !paymentStatus) ||
      !all?.meta ||
      all.meta.page !== 1 ||
      all.data.length !== all.meta.total
    )
      return null;
    const filter = storeOrderStatusQuery(status);
    const filtered = all.data.filter(
      (order) =>
        (!filter.status || order.status === filter.status) &&
        (!paymentStatus || order.payment_status === paymentStatus),
    );
    const pageSize = all.meta.page_size;
    return {
      data: filtered.slice((page - 1) * pageSize, page * pageSize),
      meta: { page, page_size: pageSize, total: filtered.length },
      receivedAt: all.receivedAt,
    };
  }, [cache, key, allKey, status, paymentStatus, page]);

  useEffect(() => {
    const current = ++requestId.current;
    const controller = new AbortController();
    async function loadPage() {
      try {
        const next = await listStoreOrders(
          { page, search, sort, paymentStatus, ...storeOrderStatusQuery(status) },
          controller.signal,
        );
        if (current !== requestId.current) return;
        if (next.meta) {
          const lastPage = Math.max(1, Math.ceil(next.meta.total / next.meta.page_size));
          if (page > lastPage) {
            // Orders can leave a filtered list while another admin is viewing it.
            // Drop older pages too, then fetch the last remaining valid page.
            setCache(new Map());
            setFailure(null);
            setPage(lastPage);
            return;
          }
        }
        setCache((previous) => {
          const pages = new Map(previous);
          pages.delete(key);
          pages.set(key, { ...next, receivedAt: performance.now() });
          if (pages.size > MAX_CACHED_PAGES) {
            const oldest = pages.keys().next().value;
            if (oldest !== undefined) pages.delete(oldest);
          }
          return pages;
        });
        setFailure(null);
      } catch (error) {
        if (current !== requestId.current || isRequestCanceled(error, controller.signal)) return;
        const message = getErrorMessage(error);
        if (isProtectedDataError(error)) {
          setCache(new Map());
          expiredReloads.current.clear();
          setFailure({ message });
        } else {
          setFailure({ key, message });
        }
      } finally {
        // Publish the response and end its refresh in the same update.
        if (current === requestId.current) setRefreshKey(null);
      }
    }
    if (!denied && ((!payload && !failedCurrentPage) || refreshKey === key)) {
      void loadPage();
    }
    return () => {
      if (current === requestId.current) requestId.current += 1;
      controller.abort();
    };
  }, [
    denied,
    failedCurrentPage,
    getErrorMessage,
    key,
    page,
    payload,
    search,
    sort,
    status,
    paymentStatus,
    refreshKey,
  ]);

  const reload = useCallback(() => {
    setCache(payload ? new Map([[key, payload]]) : new Map());
    setFailure(null);
    setRefreshKey(key);
  }, [key, payload]);
  useEffect(() => {
    const now = performance.now();
    // Cached waiting orders may expire into the currently empty cancelled tab.
    // Observe every known page, not only its visible filtered projection.
    const due = [...cache.values()].flatMap((cached) =>
      cached.data
        .filter(
          (order) =>
            storeOrderHasDeadline(order) &&
            !expiredReloads.current.has(`${order.id}:${order.expires_at}`),
        )
        .map((order) => ({ order, delay: storeDeadlineRemainingMs(order, cached.receivedAt, now) }))
        .filter(
          (item): item is { order: StoreOrder; delay: number } =>
            item.delay !== null && Number.isFinite(item.delay),
        ),
    );
    if (!due.length) return;
    const first = Math.min(...due.map((item) => item.delay));
    const timer = window.setTimeout(() => {
      for (const item of due) {
        if (item.delay <= first)
          expiredReloads.current.add(`${item.order.id}:${item.order.expires_at}`);
      }
      // Refresh authoritative states and counts; never mark an order cancelled locally.
      reload();
    }, first);
    return () => window.clearTimeout(timer);
  }, [cache, reload]);

  const error = denied || failure?.key === key ? (failure?.message ?? "") : "";
  return {
    items: denied ? null : (payload?.data ?? null),
    meta: denied ? null : (payload?.meta ?? null),
    loading: refreshKey === key || (!payload && !error),
    error,
    page,
    setPage,
    reload,
  };
}
