import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { AdminQueryProvider } from "@/components/admin-query-provider";
import { PointsManager } from "@/components/points-manager";
import { useAdminUserDetail } from "@/lib/admin-users-query";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const account = {
  id: "58cbea40-4749-4400-9fa3-188de573abaf",
  name: "Protected Points Member",
  email: "private-points@example.com",
  login_phone_number: "+84912345678",
  email_verified: true,
  has_csa_customer: false,
  status: "active",
  date_joined: "2026-07-20T02:00:00Z",
  points_balance: 827,
};

const listPath = "/api/backend/admin/users";
const initialPath = `${listPath}?page=1&search=`;
const searchPath = `${listPath}?page=1&search=orchard`;
const pageTwoPath = `${listPath}?page=2&search=`;

function page(record = account, current = 1, total = 31) {
  return Response.json({
    data: [record],
    meta: { page: current, page_size: 30, total },
  });
}

function deferredResponse() {
  let resolve!: (response: Response) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Response>((finish, fail) => {
    resolve = finish;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function scene(extra?: ReactNode) {
  return (
    <AdminI18nProvider initialLocale="en">
      <AdminQueryProvider>
        <PointsManager />
        {extra}
      </AdminQueryProvider>
    </AdminI18nProvider>
  );
}

function submitSearch() {
  const search = screen.getByRole("searchbox");
  fireEvent.change(search, { target: { value: "orchard" } });
  fireEvent.submit(search.closest("form")!);
}

async function expectInitialPage() {
  const link = await screen.findByRole("link", { name: `View points: ${account.name}` });
  expect(link).toHaveAttribute("href", `/points/${account.id}`);
  const row = within(link.closest("tr")!);
  expect(row.getByText(account.email)).toBeVisible();
  expect(row.getByText(account.login_phone_number)).toBeVisible();
  expect(row.getByText("827")).toBeVisible();
  expect(screen.getByText("31 results")).toBeVisible();
  expect(screen.getByRole("navigation", { name: "Page 1/2" })).toBeVisible();
}

function expectProtectedDataAbsent() {
  expect(screen.queryByText(account.name)).not.toBeInTheDocument();
  expect(screen.queryByText(account.email)).not.toBeInTheDocument();
  expect(screen.queryByText(account.login_phone_number)).not.toBeInTheDocument();
  expect(screen.queryByText("827")).not.toBeInTheDocument();
  expect(screen.queryByText("31 results")).not.toBeInTheDocument();
  expect(screen.queryByRole("navigation", { name: /page \d/i })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /view points/i })).not.toBeInTheDocument();
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Points directory authorization", () => {
  it.each([
    ["search", searchPath, submitSearch],
    [
      "pagination",
      pageTwoPath,
      () => fireEvent.click(screen.getByRole("button", { name: "Next" })),
    ],
  ] as const)(
    "clears Points data after %s returns 403 and retries the denied request",
    async (_operation, requestedPath, request) => {
      const recovered = { ...account, name: "Recovered Points Member", points_balance: 126 };
      const retry = deferredResponse();
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce(page())
        .mockResolvedValueOnce(Response.json({ error: "forbidden" }, { status: 403 }))
        .mockReturnValueOnce(retry.promise);
      vi.stubGlobal("fetch", fetcher);
      render(scene());
      await expectInitialPage();

      request();
      expect(await screen.findByRole("alert")).toHaveTextContent(/not allowed/i);
      expectProtectedDataAbsent();
      expect(fetcher.mock.calls.map(([path]) => path)).toEqual([initialPath, requestedPath]);

      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
      await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
      expect(screen.getByRole("status")).toHaveTextContent("Loading users…");
      expectProtectedDataAbsent();
      await act(async () => retry.resolve(page(recovered, requestedPath === pageTwoPath ? 2 : 1)));
      const link = await screen.findByRole("link", {
        name: "View points: Recovered Points Member",
      });
      expect(within(link.closest("tr")!).getByText("126")).toBeVisible();
      expect(screen.queryByText("827")).not.toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(fetcher.mock.calls.map(([path]) => path)).toEqual([
        initialPath,
        requestedPath,
        requestedPath,
      ]);
    },
  );

  it.each([
    ["an expired session", 401, {}],
    ["a changed session", 409, { errors: [{ code: "session_changed" }] }],
  ] as const)("clears Points rows and navigation for %s", async (_scenario, status, body) => {
    const assign = vi.fn();
    vi.stubGlobal("location", { pathname: "/points", assign });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(page()).mockResolvedValueOnce(Response.json(body, { status })),
    );
    render(scene());
    await expectInitialPage();

    submitSearch();
    expect(await screen.findByRole("alert")).toBeVisible();
    expectProtectedDataAbsent();
    if (status === 401) expect(assign).toHaveBeenCalledWith("/login?returnTo=%2Fpoints");
  });

  it("retains authorized data during a search and on an ordinary network error", async () => {
    const pending = deferredResponse();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(page())
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(
        page({ ...account, name: "Orchard Member", points_balance: 14 }, 1, 1),
      );
    vi.stubGlobal("fetch", fetcher);
    render(scene());
    await expectInitialPage();

    submitSearch();
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("button", { name: "Searching…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    await expectInitialPage();

    await act(async () => pending.reject(new Error("transport unavailable")));
    expect(await screen.findByRole("alert")).toBeVisible();
    await expectInitialPage();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("link", { name: "View points: Orchard Member" })).toBeVisible();
    expect(screen.getByText("1 result")).toBeVisible();
    expect(screen.queryByText("827")).not.toBeInTheDocument();
  });

  it("discards a late Points page when another Users read has already been denied", async () => {
    let lateSignal: AbortSignal | null | undefined;
    const pending = deferredResponse();
    const fetcher = vi.fn(async (path: string, init?: RequestInit) => {
      if (path === initialPath) return page();
      if (path === pageTwoPath) {
        lateSignal = init?.signal;
        return pending.promise;
      }
      if (path === `${listPath}/${account.id}?invited_page=1`) {
        return Response.json({ error: "forbidden" }, { status: 403 });
      }
      throw new Error(`Unexpected API request: ${path}`);
    });
    vi.stubGlobal("fetch", fetcher);
    function DeniedDetailRead() {
      useAdminUserDetail(account.id, 1);
      return null;
    }

    const view = render(scene());
    await expectInitialPage();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(lateSignal).toBeInstanceOf(AbortSignal));
    view.rerender(scene(<DeniedDetailRead />));
    expect(await screen.findByRole("alert")).toHaveTextContent(/not allowed/i);
    expect(lateSignal?.aborted).toBe(true);
    expectProtectedDataAbsent();

    await act(async () => {
      pending.resolve(page({ ...account, name: "Late Points Member", points_balance: 667 }, 2));
    });
    expect(screen.getByRole("alert")).toHaveTextContent(/not allowed/i);
    expect(screen.queryByText("Late Points Member")).not.toBeInTheDocument();
    expect(screen.queryByText("667")).not.toBeInTheDocument();
    expectProtectedDataAbsent();
  });
});
