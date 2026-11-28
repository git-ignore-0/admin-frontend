import { useEffect, useMemo } from "react";
import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query";

type Attempt<T> = { phase: "pending" | "unknown"; payload: T };
type MutationIntent<T, R> = Attempt<T> | { phase: "confirmed"; receipt: R } | { phase: "retired" };

/** Keep the submitted intent across route changes within the existing Admin query scope. */
export function useAdminMutationIntent<T, R = never>(domain: string, resource: string) {
  const client = useQueryClient();
  const key = useMemo(() => ["admin-mutation-intent", domain, resource], [domain, resource]);
  const { data: intent } = useQuery<MutationIntent<T, R> | null>(
    { queryKey: key, queryFn: skipToken, gcTime: Infinity, structuralSharing: false },
    client,
  );
  const controls = useMemo(() => {
    const read = () => client.getQueryData<MutationIntent<T, R> | null>(key);
    const trim = () => {
      const query = client.getQueryCache().find({ queryKey: key, exact: true });
      if (query && query.getObserversCount() === 0 && !query.state.data) {
        client.removeQueries({ queryKey: key, exact: true });
      }
    };
    const write = (value: MutationIntent<T, R> | null) => {
      client.setQueryData(key, value);
      if (value === null) trim();
    };
    return {
      read,
      trim,
      begin(payload?: T) {
        const current = read();
        const candidate = current?.phase === "unknown" ? current.payload : payload;
        if (
          candidate === undefined ||
          (current &&
            (current.phase !== "unknown" || (payload !== undefined && payload !== current.payload)))
        )
          return null;
        const attempt: Attempt<T> = { phase: "pending", payload: candidate };
        write(attempt);
        return attempt;
      },
      settle(attempt: Attempt<T>, result: MutationIntent<T, R> | null) {
        if (read() !== attempt) return false;
        write(result);
        return true;
      },
      clear() {
        if (read()) write(null);
      },
      retire() {
        if (read()) write({ phase: "retired" });
      },
    };
  }, [client, key]);
  useEffect(() => () => queueMicrotask(controls.trim), [controls]);
  return { intent, controls };
}
