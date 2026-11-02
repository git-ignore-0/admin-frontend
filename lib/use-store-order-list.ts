"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ApiEnvelope } from "@/lib/client-api";
import {
  listStoreOrders,
  storeOrderStatusQuery,
  type StoreOrderDisplayStatus,
} from "@/lib/store-orders";
import type { PaginationMeta, StoreOrder, StoreOrderSort } from "@/lib/types";

type OrderPage = ApiEnvelope<StoreOrder[], PaginationMeta>;

/** Cache belongs to this mounted list; explicit reload invalidates every tab. */
export function useStoreOrderList({
  search,
  sort,
  status,
  getErrorMessage,
}: {
  search: string;
  sort: StoreOrderSort;
  status: StoreOrderDisplayStatus | "";
  getErrorMessage: (error: unknown) => string;
}) {
  const [page, setPage] = useState(1);
  const [cache, setCache] = useState<Map<string, OrderPage>>(() => new Map());
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const [version, setVersion] = useState(0);
  const requestId = useRef(0);
  const key = JSON.stringify([search, sort, status, page]);
  const allKey = JSON.stringify([search, sort, "", 1]);
  const payload = useMemo(() => {
    const exact = cache.get(key);
    if (exact) return exact;
    const all = cache.get(allKey);
    // A partial server page must never be mistaken for the whole collection.
    if (!status || !all?.meta || all.meta.page !== 1 || all.data.length !== all.meta.total)
      return null;
    const filter = storeOrderStatusQuery(status);
    const filtered = all.data.filter(
      (order) =>
        order.status === filter.status &&
        (!filter.paymentStatus || order.payment_status === filter.paymentStatus),
    );
    const pageSize = all.meta.page_size;
    return {
      data: filtered.slice((page - 1) * pageSize, page * pageSize),
      meta: { page, page_size: pageSize, total: filtered.length },
    };
  }, [cache, key, allKey, status, page]);

  useEffect(() => {
    const current = ++requestId.current;
    if (!payload) {
      void listStoreOrders({ page, search, sort, ...storeOrderStatusQuery(status) })
        .then((next) => {
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
          setCache((previous) => new Map(previous).set(key, next));
          setFailure(null);
        })
        .catch((error: unknown) => {
          if (current === requestId.current) setFailure({ key, message: getErrorMessage(error) });
        });
    }
    return () => {
      if (current === requestId.current) requestId.current += 1;
    };
  }, [getErrorMessage, key, page, payload, search, sort, status, version]);

  const reload = useCallback(() => {
    requestId.current += 1;
    setCache(new Map());
    setFailure(null);
    setVersion((current) => current + 1);
  }, []);
  const error = failure?.key === key ? failure.message : "";
  return {
    items: payload?.data ?? null,
    meta: payload?.meta ?? null,
    loading: !payload && !error,
    error,
    page,
    setPage,
    reload,
  };
}
