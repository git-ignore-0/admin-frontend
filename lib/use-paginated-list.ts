"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { requirePaginatedList, requireResponseList } from "@/lib/api-response";
import type { ApiEnvelope } from "@/lib/client-api";
import { isProtectedDataError, isRequestCanceled } from "@/lib/client-error";
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
  const key = useMemo(() => ({ page, requestKey, fetchPage }), [fetchPage, page, requestKey]);
  const [settledKey, setSettledKey] = useState<typeof key>();
  const activeKey = useRef(key);
  const activeRequest = useRef<AbortController | null>(null);
  const revision = useRef(0);
  const mounted = useRef(false);
  const denied = useRef(false);
  const cancelActiveRequest = useCallback(() => {
    const previous = activeRequest.current;
    activeRequest.current = null;
    previous?.abort();
  }, []);

  useLayoutEffect(() => {
    mounted.current = true;
    activeKey.current = key;
    setItems(null);
    setMeta(null);
    setError("");
    return () => {
      mounted.current = false;
      revision.current += 1;
      cancelActiveRequest();
    };
  }, [cancelActiveRequest, enabled, key]);

  const retire = useCallback(
    (caught: unknown) => {
      if (!mounted.current) return;
      cancelActiveRequest();
      revision.current += 1;
      denied.current = true;
      setItems(null);
      setMeta(null);
      setError(getErrorMessage(caught));
      setSettledKey(activeKey.current);
      setLoading(false);
    },
    [cancelActiveRequest, getErrorMessage],
  );

  useEffect(() => {
    if (!enabled) {
      setItems(null);
      setMeta(null);
      setError("");
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
        const { data, meta } = requirePaginatedList(payload, validateRecord, page);
        const lastPage = Math.max(1, Math.ceil(meta.total / meta.page_size));
        if (controlledPage === undefined && page > lastPage) {
          setLocalPage(lastPage);
          return;
        }
        denied.current = false;
        setItems(data);
        setMeta(meta);
      } catch (error) {
        if (activeRequest.current === controller && !isRequestCanceled(error, controller.signal)) {
          if (isProtectedDataError(error)) {
            retire(error);
            return;
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
    controlledPage,
    enabled,
    fetchPage,
    getErrorMessage,
    key,
    page,
    reloadVersion,
    retire,
    validateRecord,
  ]);

  const reload = useCallback(() => {
    revision.current += 1;
    cancelActiveRequest();
    setReloadVersion((current) => current + 1);
  }, [cancelActiveRequest]);
  const capturedRevision = revision.current;
  const replaceData = useCallback(
    (nextItems: T[], nextMeta?: M | null) => {
      if (!mounted.current || !enabled || denied.current || revision.current !== capturedRevision)
        return;
      requireResponseList(nextItems, validateRecord);
      cancelActiveRequest();
      setItems(nextItems);
      if (nextMeta !== undefined) setMeta(nextMeta);
      setError("");
      setSettledKey(key);
      setLoading(false);
    },
    [cancelActiveRequest, capturedRevision, enabled, key, validateRecord],
  );

  const showResult = enabled && key === settledKey;
  return {
    error: showResult ? error : "",
    items: showResult ? items : null,
    loading: enabled && (!showResult || loading),
    meta: showResult ? meta : null,
    page,
    reload,
    replaceData,
    retire,
    setPage,
  };
}
