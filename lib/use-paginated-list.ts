"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { requirePaginatedList, requireResponseList } from "@/lib/api-response";
import type { ApiEnvelope } from "@/lib/client-api";
import { isRequestCanceled } from "@/lib/client-error";
import type { PaginationMeta } from "@/lib/types";

type PaginatedListOptions<T, M extends PaginationMeta> = {
  fetchPage: (page: number, signal: AbortSignal) => Promise<ApiEnvelope<T[], M>>;
  getErrorMessage: (error: unknown) => string;
  validateRecord?: (record: T) => void;
  initialPage?: number;
  controlledPage?: number;
  onPage?: (page: number) => void;
  enabled?: boolean;
  /** Identify the applied query. Only its current page may expose data or errors. */
  requestKey?: string;
};

export function usePaginatedList<T, M extends PaginationMeta = PaginationMeta>({
  fetchPage,
  getErrorMessage,
  validateRecord,
  initialPage = 1,
  controlledPage,
  onPage,
  enabled = true,
  requestKey,
}: PaginatedListOptions<T, M>) {
  const [items, setItems] = useState<T[] | null>(null);
  const [meta, setMeta] = useState<M | null>(null);
  const [localPage, setLocalPage] = useState(initialPage);
  const page = controlledPage ?? localPage;
  const setPage = onPage ?? setLocalPage;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadVersion, setReloadVersion] = useState(0);
  const key = requestKey === undefined ? undefined : JSON.stringify([requestKey, page]);
  const [settledKey, setSettledKey] = useState<string | undefined>();
  const activeRequest = useRef<AbortController | null>(null);
  const cancelActiveRequest = useCallback(() => {
    const previous = activeRequest.current;
    activeRequest.current = null;
    previous?.abort();
  }, []);

  useEffect(() => {
    if (!enabled) {
      if (key !== undefined) {
        setItems(null);
        setMeta(null);
        setError("");
      }
      return;
    }
    const controller = new AbortController();
    activeRequest.current = controller;
    setLoading(true);
    setError("");

    async function loadPage() {
      try {
        const payload = await fetchPage(page, controller.signal);
        if (activeRequest.current !== controller) return;
        const { data, meta } = requirePaginatedList(payload, validateRecord);
        setItems(data);
        setMeta(meta);
      } catch (error) {
        if (activeRequest.current === controller && !isRequestCanceled(error, controller.signal)) {
          if (key !== undefined) {
            setItems(null);
            setMeta(null);
          }
          setError(getErrorMessage(error));
        }
      } finally {
        if (activeRequest.current === controller) {
          activeRequest.current = null;
          setSettledKey(key);
          setLoading(false);
        }
      }
    }

    void loadPage();
    return () => {
      if (activeRequest.current === controller) cancelActiveRequest();
    };
  }, [
    cancelActiveRequest,
    enabled,
    fetchPage,
    getErrorMessage,
    key,
    page,
    reloadVersion,
    validateRecord,
  ]);

  const reload = useCallback(() => {
    cancelActiveRequest();
    setReloadVersion((current) => current + 1);
  }, [cancelActiveRequest]);
  const replaceData = useCallback(
    (nextItems: T[], nextMeta?: M | null) => {
      requireResponseList(nextItems, validateRecord);
      cancelActiveRequest();
      setItems(nextItems);
      if (nextMeta !== undefined) setMeta(nextMeta);
      setError("");
      setSettledKey(key);
      setLoading(false);
    },
    [cancelActiveRequest, key, validateRecord],
  );

  const showResult = key === undefined || (enabled && key === settledKey);
  return {
    error: showResult ? error : "",
    items: showResult ? items : null,
    loading: key === undefined ? loading : enabled && (!showResult || loading),
    meta: showResult ? meta : null,
    page,
    reload,
    replaceData,
    setPage,
  };
}
