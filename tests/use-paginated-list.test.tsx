import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ApiEnvelope } from "@/lib/client-api";
import type { PaginationMeta } from "@/lib/types";
import { usePaginatedList } from "@/lib/use-paginated-list";

type Page = ApiEnvelope<string[], PaginationMeta>;
const pageData = (page: number, item: string): Page => ({
  data: [item],
  meta: { page, page_size: 10, total: 25 },
});
const getErrorMessage = (error: unknown) => (error as Error).message;

function pendingTransport() {
  const requests: Array<{
    page: number;
    signal: AbortSignal;
    resolve: (value: Page) => void;
    reject: (error: Error) => void;
  }> = [];
  const fetchPage = vi.fn(
    (page: number, signal: AbortSignal) =>
      new Promise<Page>((resolve, reject) => {
        // Deliberately ignores cancellation so the hook's identity guard is exercised.
        requests.push({ page, signal, resolve, reject });
      }),
  );
  return { requests, fetchPage };
}

afterEach(cleanup);

it("aborts superseded reads and ignores their late data, failures, and loading updates", async () => {
  const { requests, fetchPage } = pendingTransport();
  const { result } = renderHook(() => usePaginatedList({ fetchPage, getErrorMessage }));
  expect(result.current.loading).toBe(true);
  act(() => result.current.setPage(2));
  expect(requests[0].signal.aborted).toBe(true);
  expect(requests[1].page).toBe(2);
  expect(requests[1].signal.aborted).toBe(false);
  act(() => result.current.setPage(3));
  expect(requests[1].signal.aborted).toBe(true);
  expect(result.current.loading).toBe(true);
  await act(async () => requests[2].resolve(pageData(3, "latest")));
  await act(async () => {
    requests[1].reject(new Error("old failure"));
    requests[0].resolve(pageData(1, "old data"));
  });
  expect(result.current).toMatchObject({
    items: ["latest"],
    meta: pageData(3, "").meta,
    error: "",
    loading: false,
  });
  expect(requests[2].signal.aborted).toBe(false);
});

it("cancels on reload, replaceData and unmount, keeping replacements stable", async () => {
  const { requests, fetchPage } = pendingTransport();
  const { result, unmount } = renderHook(() => usePaginatedList({ fetchPage, getErrorMessage }));
  act(() => result.current.reload());
  expect(requests[0].signal.aborted).toBe(true);
  expect(requests[1].page).toBe(1);
  const replacement = pageData(1, "replacement");
  act(() => result.current.replaceData(replacement.data, replacement.meta));
  expect(requests[1].signal.aborted).toBe(true);
  await act(async () => requests[1].resolve(pageData(1, "obsolete")));
  expect(result.current).toMatchObject({
    items: replacement.data,
    meta: replacement.meta,
    loading: false,
    error: "",
  });
  act(() => result.current.reload());
  unmount();
  expect(requests[2].signal.aborted).toBe(true);
});

it("does not display cancellation and still handles a genuine error from a one-argument callback", async () => {
  const fetchPage = vi
    .fn(async (page: number) => pageData(page, "ready"))
    .mockRejectedValueOnce(new DOMException("aborted", "AbortError"))
    .mockRejectedValueOnce(new Error("failure"));
  const { result } = renderHook(() => usePaginatedList({ fetchPage, getErrorMessage }));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.error).toBe("");
  act(() => result.current.reload());
  await waitFor(() => expect(result.current.error).toBe("failure"));
  expect(result.current.loading).toBe(false);
  act(() => result.current.reload());
  await waitFor(() => expect(result.current.items).toEqual(["ready"]));
  expect(result.current).toMatchObject({ error: "", loading: false, meta: pageData(1, "").meta });
});
