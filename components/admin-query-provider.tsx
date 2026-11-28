"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";

const QueryScopeCurrent = createContext<(() => boolean) | null>(null);

/** Check from a delayed callback before acting on behalf of its original admin session. */
export function useIsAdminQueryScopeCurrent() {
  const isCurrent = useContext(QueryScopeCurrent);
  if (!isCurrent) throw new Error("Admin query scope is unavailable");
  return isCurrent;
}

/** Capture the record and access revision before awaiting a request or a UI side effect. */
export function useAdminRecordScope(id: string) {
  const sessionCurrent = useIsAdminQueryScopeCurrent();
  const mounted = useRef(false);
  const revision = useRef(0);
  const read = useRef<AbortController | null>(null);
  const retire = useCallback(() => {
    revision.current += 1;
    read.current?.abort();
    read.current = null;
  }, []);

  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      retire();
    };
  }, [id, retire]);

  return useMemo(() => {
    const capture = () => {
      const current = revision.current;
      return () => mounted.current && sessionCurrent() && current === revision.current;
    };
    return {
      capture,
      retire,
      beginRead() {
        read.current?.abort();
        const controller = new AbortController();
        read.current = controller;
        const current = capture();
        return {
          signal: controller.signal,
          current: () => !controller.signal.aborted && current(),
        };
      },
    };
  }, [retire, sessionCurrent]);
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 0,
        gcTime: 5 * 60 * 1000,
        retry: false,
        refetchOnMount: true,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        refetchInterval: false,
        networkMode: "online",
      },
      mutations: {
        retry: false,
        networkMode: "always",
        // Pending mutations with no observers reschedule GC. Use a short nonzero interval.
        gcTime: 30_000,
      },
    },
  });
}

export function AdminQueryProvider({
  children,
  ref,
}: {
  children: ReactNode;
  ref?: Ref<() => void>;
}) {
  const [client] = useState(createQueryClient);
  const mounted = useRef(true);
  const retired = useRef(false);
  const isCurrent = useCallback(() => mounted.current && !retired.current, []);
  const retire = useCallback(() => {
    if (retired.current) return;
    retired.current = true;
    void client.cancelQueries(undefined, { silent: true });
    client.clear();
  }, [client]);
  useImperativeHandle(ref, () => retire, [retire]);

  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // StrictMode immediately reconnects the same scope after its rehearsal cleanup.
      queueMicrotask(() => {
        if (!mounted.current) retire();
      });
    };
  }, [retire]);

  return (
    <QueryClientProvider client={client}>
      <QueryScopeCurrent.Provider value={isCurrent}>{children}</QueryScopeCurrent.Provider>
    </QueryClientProvider>
  );
}
