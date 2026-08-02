"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ApiEnvelope } from "@/lib/client-api";
import type { PaginationMeta } from "@/lib/types";

type PaginatedListOptions<T> = {
  fetchPage: (page: number) => Promise<ApiEnvelope<T[], PaginationMeta>>;
  getErrorMessage: (error: unknown) => string;
};

export function usePaginatedList<T>({ fetchPage, getErrorMessage }: PaginatedListOptions<T>) {
  const [items, setItems] = useState<T[] | null>(null);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadVersion, setReloadVersion] = useState(0);
  const requestId = useRef(0);

  useEffect(() => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError("");

    void fetchPage(page)
      .then((payload) => {
        if (currentRequest !== requestId.current) return;
        setItems(payload.data);
        setMeta(payload.meta ?? null);
      })
      .catch((caught: unknown) => {
        if (currentRequest === requestId.current) setError(getErrorMessage(caught));
      })
      .finally(() => {
        if (currentRequest === requestId.current) setLoading(false);
      });

    return () => {
      if (currentRequest === requestId.current) requestId.current += 1;
    };
  }, [fetchPage, getErrorMessage, page, reloadVersion]);

  const reload = useCallback(() => setReloadVersion((current) => current + 1), []);
  const replaceData = useCallback((nextItems: T[], nextMeta?: PaginationMeta | null) => {
    requestId.current += 1;
    setItems(nextItems);
    if (nextMeta !== undefined) setMeta(nextMeta);
    setError("");
    setLoading(false);
  }, []);

  return { error, items, loading, meta, page, reload, replaceData, setPage };
}
