import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { useQueryClient } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";

import { AdminQueryProvider } from "@/components/admin-query-provider";
import { useAdminUserDetail, useAdminUsersList } from "@/lib/admin-users-query";

const user = {
  id: "58cbea40-4749-4400-9fa3-188de573abaf",
  name: "Private account",
  email: "member@example.com",
  login_phone_number: "+84912345678",
  email_verified: true,
  has_csa_customer: false,
  points_balance: 12,
  date_joined: "2026-07-20T00:00:00Z",
  status: "active",
};
const meta = { page: 1, page_size: 30, total: 1 };
const account = {
  ...user,
  invited_users: [],
  invited_count: 0,
  referral_code: "private-code",
  referrer: null,
  source: "organic",
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("discards the Users list and detail caches on denial and drops a late detail response", async () => {
  let detailRequests = 0;
  let listRequests = 0;
  let lateSignal: AbortSignal | null | undefined;
  let finishDetail!: (response: Response) => void;
  const delayedDetail = new Promise<Response>((resolve) => {
    finishDetail = resolve;
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, options?: RequestInit) => {
      if (path.includes("invited_page")) {
        if (++detailRequests === 1) return Response.json({ data: account });
        lateSignal = options?.signal;
        return delayedDetail;
      }
      if (++listRequests === 1) return Response.json({ data: [user], meta });
      return Response.json({ error: "forbidden" }, { status: 403 });
    }),
  );
  const { result } = renderHook(
    () => ({
      client: useQueryClient(),
      list: useAdminUsersList({ search: "", status: "", page: 1 }),
      detail: useAdminUserDetail(user.id, 1),
    }),
    { wrapper: AdminQueryProvider },
  );

  await waitFor(() => expect(result.current.detail.data?.data).toEqual(account));
  expect(result.current.list.data?.meta).toEqual(meta);
  act(() => {
    void result.current.detail.refetch();
  });
  await waitFor(() => expect(lateSignal).toBeDefined());
  await act(async () => {
    await result.current.list.refetch();
  });

  await waitFor(() => expect(result.current.detail.accessDenied).toBe(true));
  expect(lateSignal?.aborted).toBe(true);
  expect(result.current.list.accessDenied).toBe(true);
  expect(result.current.list.data).toBeUndefined();
  expect(result.current.detail.data).toBeUndefined();

  await act(async () => {
    finishDetail(Response.json({ data: account }));
  });
  expect(
    result.current.client.getQueriesData({ queryKey: ["users"] }).map(([, snapshot]) => snapshot),
  ).toEqual([{ accessDenied: true }, { accessDenied: true }]);
  expect(result.current.detail.data).toBeUndefined();
});

it.each([
  { address: { line: "Private address" } },
  { referrer: { name: {} } },
  { invited_users: [null] },
  { id: "04d465b7-8245-4123-b1a5-4cf28e13e4d5" },
])("rejects malformed detail fields before publishing the query result (%o)", async (fields) => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ data: { ...account, ...fields } })),
  );
  const { result } = renderHook(() => useAdminUserDetail(user.id, 1), {
    wrapper: AdminQueryProvider,
  });
  await waitFor(() => expect(result.current.error?.message).toBe("invalid_response"));
  expect(result.current.data).toBeUndefined();
});
