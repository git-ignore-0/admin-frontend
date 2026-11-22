"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ApiEnvelope } from "@/lib/client-api";
import { isRequestCanceled } from "@/lib/client-error";
import type { PaginationMeta } from "@/lib/types";

type PaginatedListOptions<T> = {
  fetchPage: (page: number, signal: AbortSignal) => Promise<ApiEnvelope<T[], PaginationMeta>>;
  getErrorMessage: (error: unknown) => string;
  initialPage?: number;
  controlledPage?: number;
  onPage?: (page: number) => void;
};

export function usePaginatedList<T>({
  fetchPage,
  getErrorMessage,
  initialPage = 1,
  controlledPage,
  onPage,
}: PaginatedListOptions<T>) {
  const [items, setItems] = useState<T[] | null>(null);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [localPage, setLocalPage] = useState(initialPage);
  const page = controlledPage ?? localPage;
  const setPage = onPage ?? setLocalPage;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadVersion, setReloadVersion] = useState(0);
  const activeRequest = useRef<AbortController | null>(null);
  const cancelActiveRequest = useCallback(() => {
    const previous = activeRequest.current;
    activeRequest.current = null;
    previous?.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    activeRequest.current = controller;
    setLoading(true);
    setError("");

    async function loadPage() {
      try {
        const payload = await fetchPage(page, controller.signal);
        if (activeRequest.current !== controller) return;
        setItems(payload.data);
        setMeta(payload.meta ?? null);
      } catch (error) {
        if (activeRequest.current === controller && !isRequestCanceled(error, controller.signal)) {
          setError(getErrorMessage(error));
        }
      } finally {
        if (activeRequest.current === controller) {
          activeRequest.current = null;
          setLoading(false);
        }
      }
    }

    void loadPage();
    return () => {
      if (activeRequest.current === controller) cancelActiveRequest();
    };
  }, [cancelActiveRequest, fetchPage, getErrorMessage, page, reloadVersion]);

  const reload = useCallback(() => {
    cancelActiveRequest();
    setReloadVersion((current) => current + 1);
  }, [cancelActiveRequest]);
  const replaceData = useCallback(
    (nextItems: T[], nextMeta?: PaginationMeta | null) => {
      cancelActiveRequest();
      setItems(nextItems);
      if (nextMeta !== undefined) setMeta(nextMeta);
      setError("");
      setLoading(false);
    },
    [cancelActiveRequest],
  );

  return { error, items, loading, meta, page, reload, replaceData, setPage };
}
