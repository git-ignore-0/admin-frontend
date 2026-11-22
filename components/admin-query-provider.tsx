"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useImperativeHandle,
  useLayoutEffect,
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
