import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { usePaginatedList } from "@/lib/use-paginated-list";

const previous = [{ id: "private" }];
const page = (data: typeof previous, page = 1, total = data.length) => ({
  data,
  meta: { page, page_size: 20, total },
});
const getErrorMessage = (error: unknown) => (error as Error).message;

it("retires the list on a 403 and rejects an optimistic rollback from before denial", async () => {
  const fetchPage = vi.fn().mockResolvedValueOnce(page(previous));
  const { result } = renderHook(() => usePaginatedList({ fetchPage, getErrorMessage }));
  await waitFor(() => expect(result.current.items).toEqual(previous));
  const replace = result.current.replaceData;
  fetchPage.mockRejectedValueOnce(Object.assign(new Error("forbidden"), { status: 403 }));
  act(result.current.reload);
  await waitFor(() => expect(result.current.error).toBe("forbidden"));
  act(() => replace(previous));
  expect(result.current.items).toBeNull();
  expect(result.current.meta).toBeNull();
  expect(result.current.error).toBe("forbidden");
});

it("keeps valid data after a temporary refresh failure and hides it as soon as the page changes", async () => {
  const fetchPage = vi.fn().mockResolvedValueOnce(page(previous, 1, 23));
  const { result } = renderHook(() => usePaginatedList({ fetchPage, getErrorMessage }));
  await waitFor(() => expect(result.current.items).toEqual(previous));
  fetchPage.mockRejectedValueOnce(new Error("network_error"));
  act(result.current.reload);
  await waitFor(() => expect(result.current.error).toBe("network_error"));
  expect(result.current.items).toEqual(previous);
  fetchPage.mockReturnValueOnce(new Promise(() => {}));
  act(() => result.current.setPage(2));
  expect(result.current.items).toBeNull();
  expect(result.current.meta).toBeNull();
  expect(result.current.loading).toBe(true);
});

it("reads the last valid local page once after deletion empties the current page", async () => {
  const fetchPage = vi.fn().mockResolvedValueOnce(page([], 3, 24));
  fetchPage.mockResolvedValueOnce(page(previous, 2, 24));
  const { result } = renderHook(() =>
    usePaginatedList({ fetchPage, getErrorMessage, initialPage: 3 }),
  );
  await waitFor(() => expect(result.current.items).toEqual(previous));
  expect(result.current.page).toBe(2);
  expect(fetchPage.mock.calls.map(([requestedPage]) => requestedPage)).toEqual([3, 2]);
});
