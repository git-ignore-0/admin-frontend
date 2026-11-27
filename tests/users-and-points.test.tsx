import { selectOption } from "./select-option";
import UsersRouteLoading from "@/app/(admin)/users/loading";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { focusManager, onlineManager } from "@tanstack/react-query";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import { usePathname } from "next/navigation";
import type { NextRouter } from "next/router";
import { useCallback } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import UsersLayout from "@/app/(admin)/users/layout";
import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { AdminNavigationProvider, type AdminNavigate } from "@/components/admin-navigation-link";
import { AdminQueryProvider } from "@/components/admin-query-provider";
import { PointDetail } from "@/components/point-detail";
import { PointLedger } from "@/components/point-ledger";
import { PointsManager } from "@/components/points-manager";
import { ToastProvider } from "@/components/toast-provider";
import { UserDetail } from "@/components/user-detail";
import { UserDirectory } from "@/components/user-directory";
import { api, apiEnvelope } from "@/lib/client-api";
import type { AdminUserListItem, PaginationMeta } from "@/lib/types";
import { usePaginatedList } from "@/lib/use-paginated-list";

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
}));
vi.mock("@/lib/client-api", () => ({ api: vi.fn(), apiEnvelope: vi.fn() }));
vi.mock("next/navigation", async () => {
  const { useMemo, useSyncExternalStore } = await import("react");
  const subscribe = (notify: () => void) => {
    window.addEventListener("popstate", notify);
    window.addEventListener("test-history-change", notify);
    return () => {
      window.removeEventListener("popstate", notify);
      window.removeEventListener("test-history-change", notify);
    };
  };
  return {
    useRouter: () => router,
    usePathname: () => useSyncExternalStore(subscribe, () => window.location.pathname),
    useSearchParams: () => {
      const search = useSyncExternalStore(subscribe, () => window.location.search);
      return useMemo(() => new URLSearchParams(search), [search]);
    },
  };
});

beforeEach(() => {
  window.history.replaceState(null, "", "/users");
  router.prefetch.mockResolvedValue(undefined);
  vi.mocked(api).mockImplementation(async (path) => {
    if (path === "administrative-units/provinces") return [{ code: "79", name: "Sample City" }];
    if (path === "administrative-units/wards?province=79") {
      return [{ code: "26734", name: "Sample Ward" }];
    }
    throw new Error(`Unexpected API request: ${path}`);
  });
  const replaceState = window.history.replaceState.bind(window.history);
  vi.spyOn(window.history, "replaceState").mockImplementation((data, unused, url) => {
    replaceState(data, unused, url);
    window.dispatchEvent(new Event("test-history-change"));
  });
});
afterEach(() => {
  cleanup();
  focusManager.setFocused(undefined);
  onlineManager.setOnline(true);
  vi.restoreAllMocks();
  vi.mocked(api).mockReset();
  vi.mocked(apiEnvelope).mockReset();
  vi.clearAllMocks();
});

function scene(children: React.ReactNode, navigate?: AdminNavigate) {
  return (
    <RouterContext.Provider value={router as unknown as NextRouter}>
      <AdminI18nProvider initialLocale="en">
        <ToastProvider>
          <AdminQueryProvider>
            <AdminNavigationProvider value={navigate ?? null}>{children}</AdminNavigationProvider>
          </AdminQueryProvider>
        </ToastProvider>
      </AdminI18nProvider>
    </RouterContext.Provider>
  );
}

function providers(children: React.ReactNode) {
  return render(scene(children));
}

function PaginatedUserHarness({
  fetcher,
  requestKey,
}: {
  fetcher: (
    requestKey: string,
    page: number,
  ) => Promise<{ data: AdminUserListItem[]; meta: PaginationMeta }>;
  requestKey: string;
}) {
  const fetchPage = useCallback((page: number) => fetcher(requestKey, page), [fetcher, requestKey]);
  const getErrorMessage = useCallback(() => "load failed", []);
  const { items, meta } = usePaginatedList({ fetchPage, getErrorMessage });
  return (
    <div>
      {items?.map((item) => (
        <span key={item.id}>{item.name}</span>
      ))}
      {meta && <span data-testid="user-harness-total">{meta.total}</span>}
    </div>
  );
}

const user = {
  id: "58cbea40-4749-4400-9fa3-188de573abaf",
  name: "Green Member",
  email: "green@example.com",
  email_verified: true,
  login_phone_number: "+84912345678",
  phone: "+84 912 345 678",
  province_code: "79",
  ward_code: "26734",
  address: "12 Main Street",
  has_csa_customer: false,
  status: "active",
  date_joined: "2026-07-20T02:00:00Z",
  points_balance: 50,
};

function pointWrites() {
  return vi.mocked(apiEnvelope).mock.calls.filter(([, init]) => init?.method === "POST");
}

function pointResponses(balance: number, beforeWrite?: () => void) {
  vi.mocked(apiEnvelope).mockImplementation(async (path, init) => {
    if (init?.method !== "POST") {
      return {
        data: [],
        meta: { page: 1, page_size: 30, total: 0, balance, can_adjust_points: true },
      };
    }
    expect(path).toBe(`admin/users/${user.id}/points`);
    beforeWrite?.();
    const { direction, amount, message, idempotency_key } = JSON.parse(String(init.body));
    const transaction_id = "0eb05ea3-2160-49f4-9e6f-d7099a1f6afa";
    return {
      data: {
        transaction: {
          id: transaction_id,
          direction,
          amount,
          message,
          actor: null,
          created_at: "2026-07-20T02:00:00Z",
        },
        balance: balance + amount,
      },
      meta: {
        action_receipt: {
          action: "adjust_points",
          user_id: user.id,
          transaction_id,
          idempotency_key,
        },
      },
    };
  });
}

describe("users and points", () => {
  it("uses the user name as the only localized detail link for Users and Points", async () => {
    vi.mocked(apiEnvelope).mockResolvedValue({
      data: [user],
      meta: { page: 1, page_size: 30, total: 1 },
    });
    const usersView = providers(<UserDirectory />);

    expect(await screen.findByText("green@example.com")).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "Users" });
    const scrollArea = screen.getByRole("region", { name: "Users" });
    expect(scrollArea).toContainElement(table);
    expect(scrollArea).toHaveAttribute("tabindex", "0");
    expect(screen.getByText("20/07/2026")).toBeInTheDocument();
    expect(within(table).queryByText("20/07/2026 09:00")).toBeNull();
    expect(screen.getByRole("link", { name: `View details: ${user.name}` })).toHaveAttribute(
      "href",
      `/users/${user.id}`,
    );
    expect(screen.getAllByRole("link", { name: `View details: ${user.name}` })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "View details" })).toBeNull();

    usersView.unmount();
    window.history.replaceState(null, "", "/points");
    providers(<PointsManager />);
    expect(await screen.findByRole("link", { name: `View points: ${user.name}` })).toHaveAttribute(
      "href",
      `/points/${user.id}`,
    );
    expect(screen.getAllByRole("link", { name: `View points: ${user.name}` })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "View points" })).toBeNull();
    const pointsRow = screen.getByRole("row", { name: /Green Member/ });
    expect(within(pointsRow).getByText("50")).toBeVisible();
    expect(within(pointsRow).getByText("0912345678")).toBeVisible();
    expect(within(pointsRow).getByText("20/07/2026 09:00")).toBeVisible();
  });

  it("renders the four Users columns with verification, CSA and every account status", async () => {
    vi.mocked(apiEnvelope).mockResolvedValue({
      data: [
        { ...user, has_csa_customer: true },
        {
          ...user,
          id: "pending",
          name: "Pending Member",
          email_verified: false,
          status: "pending_activation",
        },
        { ...user, id: "suspended", name: "Suspended Member", status: "suspended" },
        { ...user, id: "deletion", name: "Deletion Member", status: "deletion_requested" },
        { ...user, id: "anonymized", name: "Anonymized Member", email: null, status: "anonymized" },
        { ...user, id: "unknown", name: "Unknown Member", status: "external_review" },
      ],
      meta: { page: 1, page_size: 30, total: 6 },
    });
    providers(<UserDirectory />);

    const table = await screen.findByRole("table", { name: "Users" });
    const head = within(table).getAllByRole("columnheader");
    expect(head.map((header) => header.textContent)).toEqual(["Users", "CSA", "Created", "Status"]);
    const headings = screen.getAllByRole("heading", { name: "Users" });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveClass("mantine-VisuallyHidden-root");

    const active = within(within(table).getByRole("row", { name: /Green Member/ }));
    const pending = within(within(table).getByRole("row", { name: /Pending Member/ }));
    expect(active.getByLabelText(/verified/i)).toBeInTheDocument();
    expect(pending.queryByLabelText(/verified/i)).toBeNull();
    expect(active.getByRole("cell", { name: "Has a CSA customer profile" })).toBeInTheDocument();
    expect(pending.getByRole("cell", { name: "No CSA customer profile" })).toBeInTheDocument();
    expect(active.getAllByRole("cell")[1].querySelector("svg")).toBeInTheDocument();
    expect(pending.getAllByRole("cell")[1].querySelector("svg")).toBeNull();
    const indicator = active.getByRole("img", { name: "Has a CSA customer profile" });
    expect(indicator).toHaveAttribute("tabindex", "0");
    fireEvent.focus(indicator);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Has a CSA customer profile");
    expect(active.queryByText("0912345678")).toBeNull();
    expect(active.queryByText(user.login_phone_number)).toBeNull();
    expect(active.queryByText(user.phone)).toBeNull();
    expect(active.queryByText("50")).toBeNull();
    for (const status of [
      "Active",
      "Pending activation",
      "Suspended",
      "Deletion requested",
      "Anonymized",
      "external_review",
    ]) {
      expect(within(table).getByText(status)).toBeVisible();
    }
    expect(within(table).getByText("No email")).toBeVisible();
  });

  it("uses the same suspended status treatment in the directory and user detail", async () => {
    vi.mocked(apiEnvelope).mockImplementation(async (path: string) => ({
      data: path.startsWith("admin/users?")
        ? [{ ...user, status: "suspended" }]
        : {
            ...user,
            status: "suspended",
            referral_code: "NFV1234567",
            source: "organic",
            referrer: null,
            invited_count: 0,
            invited_users: [],
          },
      meta: { page: 1, page_size: 30, total: 1, invited: { page: 1, page_size: 30, total: 0 } },
    }));
    const directory = providers(<UserDirectory />);
    const listStatus = (await screen.findByText("Suspended")).closest(".mantine-Badge-root");
    expect(listStatus).toHaveClass("mantine-Badge-root");
    const statusStyle = listStatus?.getAttribute("style");
    expect(statusStyle).toContain("red");
    directory.unmount();
    providers(<UserDetail userId={user.id} />);
    const detailStatus = (await screen.findByText("Suspended")).closest(".mantine-Badge-root");
    expect(detailStatus).toHaveClass("mantine-Badge-root");
    expect(detailStatus?.getAttribute("style")).toBe(statusStyle);
    expect(screen.queryByRole("button", { name: "Reactivate" })).toBeNull();
  });

  it("searches from page one, clears to all users, and updates the pluralized result count", async () => {
    vi.mocked(apiEnvelope).mockImplementation(async (path: string) => ({
      data: [path.includes("search=912") ? { ...user, name: "Matched Member" } : user],
      meta: {
        page: path.includes("page=2") ? 2 : 1,
        page_size: 30,
        total: path.includes("search=912") ? 1 : 31,
      },
    }));
    providers(<UserDirectory />);

    expect(screen.queryByText(/\d+ results?/)).toBeNull();
    expect(await screen.findByText("31 results")).toBeVisible();
    expect(
      screen.getByRole("searchbox", { name: "Search by name, email, or phone number" }),
    ).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() =>
      expect(apiEnvelope).toHaveBeenLastCalledWith(
        "admin/users?page=2&search=",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      ),
    );
    await waitFor(() => expect(screen.getByRole("searchbox")).toBeEnabled());

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: " 912 " } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() =>
      expect(apiEnvelope).toHaveBeenLastCalledWith(
        "admin/users?page=1&search=912",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      ),
    );
    expect(await screen.findByText("1 result")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() =>
      expect(apiEnvelope).toHaveBeenLastCalledWith(
        "admin/users?page=1&search=",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      ),
    );
    expect(await screen.findByText("31 results")).toBeVisible();
    expect(window.location.search).toBe("");
  });

  it("keeps current rows and metadata available while their refresh is pending", async () => {
    let resolveSearch!: (value: { data: AdminUserListItem[]; meta: PaginationMeta }) => void;
    vi.mocked(apiEnvelope)
      .mockResolvedValueOnce({ data: [user], meta: { page: 1, page_size: 30, total: 31 } })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSearch = resolve;
          }),
      );
    window.history.replaceState(null, "", "/users?search=green");
    providers(<UserDirectory />);

    const detailLink = await screen.findByRole("link", { name: `View details: ${user.name}` });
    const searchbox = screen.getByRole("searchbox", {
      name: "Search by name, email, or phone number",
    });
    fireEvent.click(screen.getByRole("button", { name: "Refresh users" }));

    await waitFor(() => expect(searchbox).toBeDisabled());
    expect(detailLink).toBeVisible();
    expect(screen.getByRole("button", { name: "Search" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Refresh users" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    expect(screen.getByRole("navigation", { name: "Page 1/2" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(detailLink.closest('[aria-busy="true"]')).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveClass("mantine-VisuallyHidden-root");
    expect(screen.getByRole("button", { name: "Refresh users" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(document.querySelectorAll(".mantine-Loader-root")).toHaveLength(1);
    expect(screen.getByText("31 results")).toBeVisible();

    await act(async () =>
      resolveSearch({
        data: [{ ...user, id: "matched-user", name: "Matched Member" }],
        meta: { page: 1, page_size: 30, total: 1 },
      }),
    );
    expect(await screen.findByRole("link", { name: "View details: Matched Member" })).toBeVisible();
    expect(screen.getByText("1 result")).toBeVisible();
  });

  it("retains the Users table during background revalidation without a visible loader", async () => {
    let resolveRefresh!: (value: { data: AdminUserListItem[]; meta: PaginationMeta }) => void;
    const meta = { page: 1, page_size: 30, total: 1 };
    vi.mocked(apiEnvelope)
      .mockResolvedValueOnce({ data: [user], meta })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveRefresh = resolve;
          }),
      );
    providers(<UserDirectory />);
    const row = await screen.findByRole("link", { name: /Green Member/ });
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await waitFor(() => expect(resolveRefresh).toBeTypeOf("function"));
    expect(row).toBeVisible();
    expect(screen.getByText("1 result")).toBeVisible();
    expect(screen.getByRole("status")).toHaveClass("mantine-VisuallyHidden-root");
    expect(screen.getByRole("button", { name: "Refresh users" })).not.toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(document.querySelector(".mantine-Loader-root")).toBeNull();
    await act(async () => resolveRefresh({ data: [user], meta }));
  });

  it("keeps the canonical detail link and delegates row clicks while preserving native modified clicks", async () => {
    window.history.replaceState(null, "", "/users?page=2&search=green&status=active");
    vi.mocked(apiEnvelope).mockResolvedValue({
      data: [user],
      meta: { page: 2, page_size: 30, total: 31 },
    });
    const navigate = vi.fn<AdminNavigate>();
    render(scene(<UserDirectory />, navigate));
    const link = await screen.findByRole("link", { name: "View details: Green Member" });
    expect(link).toHaveAttribute("data-underline", "never");
    const href = new URL(link.getAttribute("href")!, window.location.origin);
    expect(href.pathname).toBe(`/users/${user.id}`);
    expect(Object.fromEntries(href.searchParams)).toEqual({
      page: "2",
      search: "green",
      status: "active",
    });

    let wasPrevented = true;
    document.addEventListener(
      "click",
      (event) => {
        wasPrevented = event.defaultPrevented;
        event.preventDefault();
      },
      { once: true },
    );
    fireEvent.click(link, { ctrlKey: true });
    expect(wasPrevented).toBe(false);
    expect(navigate).not.toHaveBeenCalled();

    const statusCell = within(link.closest("tr")!).getByRole("cell", { name: "Active" });
    fireEvent.click(statusCell);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(`${href.pathname}${href.search}`, {
      scroll: false,
      replace: undefined,
    });
  });

  it("restores focus and keeps the draft and applied list context through close and browser forward", async () => {
    const listHref = "/users?search=green&status=active&page=2";
    window.history.replaceState(null, "", listHref);
    vi.mocked(apiEnvelope).mockImplementation(async (path: string) =>
      path.startsWith("admin/users?")
        ? { data: [user], meta: { page: 2, page_size: 30, total: 31 } }
        : {
            data: {
              ...user,
              referral_code: "NFV1234567",
              source: "organic",
              referrer: null,
              invited_count: 0,
              invited_users: [],
            },
          },
    );
    const navigate: AdminNavigate = (href) => {
      window.history.pushState(null, "", href);
      window.dispatchEvent(new Event("test-history-change"));
    };
    router.back.mockImplementationOnce(() => window.history.back());

    function InterceptedRoute() {
      const pathname = usePathname();
      return (
        <UsersLayout
          detail={
            pathname === `/users/${user.id}` ? <UserDetail userId={user.id} intercepted /> : null
          }
        >
          <UserDirectory />
        </UsersLayout>
      );
    }

    render(scene(<InterceptedRoute />, navigate));
    const link = await screen.findByRole("link", { name: "View details: Green Member" });
    const searchbox = screen.getByRole("searchbox");
    fireEvent.change(searchbox, { target: { value: "unsubmitted search" } });
    expect(searchbox).toHaveAccessibleDescription("Applied search: green");
    link.focus();
    fireEvent.click(link);
    const drawer = await screen.findByRole("dialog", { name: user.name });
    expect(window.location.pathname).toBe(`/users/${user.id}`);
    expect(link.closest("tr")).toHaveAttribute("data-selected", "true");
    expect(link.closest("[inert]")).toBeInTheDocument();
    expect(within(drawer).getByText("NFV1234567")).toBeVisible();

    fireEvent.click(within(drawer).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(link).toHaveFocus());
    expect(window.location.pathname + window.location.search).toBe(listHref);
    expect(link.closest("[inert]")).toBeNull();
    expect(searchbox).toHaveValue("unsubmitted search");
    expect(searchbox).toHaveAccessibleDescription("Applied search: green");
    expect(screen.getByRole("button", { name: "Filter (1)" })).toBeVisible();
    expect(screen.getByRole("navigation", { name: "Page 2/2" })).toBeVisible();

    window.history.forward();
    expect(await screen.findByRole("dialog", { name: user.name })).toBeVisible();
    expect(window.location.pathname).toBe(`/users/${user.id}`);
  });

  it("loads only an applied account-status filter and refreshes the filtered page", async () => {
    window.history.replaceState(null, "", "/users?page=2&search=green");
    vi.mocked(apiEnvelope).mockImplementation(async (path: string) => ({
      data: [path.includes("status=suspended") ? { ...user, status: "suspended" } : user],
      meta: { page: path.includes("page=2") ? 2 : 1, page_size: 30, total: 31 },
    }));
    providers(<UserDirectory />);
    expect(await screen.findByRole("navigation", { name: "Page 2/2" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Filter" }));
    selectOption(screen.getByRole("textbox", { name: "Account status" }), "suspended");
    expect(apiEnvelope).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(await screen.findByText("Suspended")).toBeVisible();
    expect(window.location.search).toBe("?search=green&status=suspended");

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByRole("navigation", { name: "Page 2/2" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Refresh users" }));
    await waitFor(() => expect(apiEnvelope).toHaveBeenCalledTimes(4));
    await waitFor(() => expect(screen.getByRole("button", { name: "Filter (1)" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Filter (1)" }));
    const filter = screen.getByRole("dialog", { name: "Filter (1)" });
    const clearFilter = within(filter).getByRole("button", {
      name: "Clear filters",
    });
    fireEvent.click(clearFilter);
    await waitFor(() => expect(apiEnvelope).toHaveBeenCalledTimes(5));
    expect(window.location.search).toBe("?search=green");
    expect(screen.getByRole("searchbox")).toHaveValue("green");
    expect(vi.mocked(apiEnvelope).mock.calls.map(([path]) => path)).toEqual([
      "admin/users?page=2&search=green",
      "admin/users?page=1&search=green&status=suspended",
      "admin/users?page=2&search=green&status=suspended",
      "admin/users?page=2&search=green&status=suspended",
      "admin/users?page=1&search=green",
    ]);
  });

  it("distinguishes initial loading, an empty directory, and no search matches", async () => {
    let resolveInitial!: (value: { data: AdminUserListItem[]; meta: PaginationMeta }) => void;
    const empty = { data: [], meta: { page: 1, page_size: 30, total: 0 } };
    vi.mocked(apiEnvelope)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveInitial = resolve;
          }),
      )
      .mockResolvedValueOnce(empty);
    providers(<UserDirectory />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading users…");
    expect(screen.queryByText("No users found.")).toBeNull();
    expect(screen.queryByText("0 results")).toBeNull();

    await act(async () => resolveInitial(empty));
    expect(await screen.findByText("No users found.")).toBeVisible();
    const search = screen.getByRole("searchbox");
    fireEvent.change(search, { target: { value: "missing" } });
    fireEvent.submit(search.closest("form")!);
    expect(await screen.findByText("No matching users.")).toBeVisible();
    expect(screen.queryByText("No users found.")).toBeNull();
  });

  it("retries an initial load error and retains loaded rows after a recoverable refresh error", async () => {
    const unavailable = Object.assign(new Error("server_error"), { status: 500 });
    vi.mocked(apiEnvelope)
      .mockRejectedValueOnce(unavailable)
      .mockResolvedValueOnce({
        data: [user],
        meta: { page: 1, page_size: 30, total: 31 },
      })
      .mockRejectedValueOnce(unavailable);
    providers(<UserDirectory />);
    expect(await screen.findByRole("alert")).toBeVisible();
    expect(screen.queryByRole("link", { name: /Green Member/ })).toBeNull();
    expect(screen.queryByText("31 results")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("link", { name: /Green Member/ })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Refresh users" }));
    expect(await screen.findByRole("alert")).toBeVisible();
    expect(screen.getByRole("link", { name: /Green Member/ })).toBeVisible();
    expect(screen.getByText("31 results")).toBeVisible();
  });

  it("removes cached Users rows and pagination metadata after refresh loses read permission", async () => {
    vi.mocked(apiEnvelope)
      .mockResolvedValueOnce({ data: [user], meta: { page: 1, page_size: 30, total: 31 } })
      .mockRejectedValueOnce(Object.assign(new Error("forbidden"), { status: 403 }));
    providers(<UserDirectory />);
    expect(await screen.findByRole("link", { name: /Green Member/ })).toBeVisible();
    expect(screen.getByRole("navigation", { name: "Page 1/2" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Refresh users" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/not allowed/i);
    expect(screen.queryByText(user.email)).toBeNull();
    expect(screen.queryByRole("link", { name: /Green Member/ })).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Page 1/2" })).toBeNull();
    expect(screen.queryByText("31 results")).toBeNull();
    expect(screen.getByRole("button", { name: "Create account" })).toBeDisabled();
  });

  it("cancels a superseded Users query and ignores its late success after the new query is forbidden", async () => {
    let resolveStale!: (value: { data: AdminUserListItem[]; meta: PaginationMeta }) => void;
    vi.mocked(apiEnvelope)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveStale = resolve;
          }),
      )
      .mockRejectedValueOnce(Object.assign(new Error("forbidden"), { status: 403 }));
    providers(<UserDirectory />);
    await waitFor(() => expect(apiEnvelope).toHaveBeenCalledOnce());
    const originalSignal = vi.mocked(apiEnvelope).mock.calls[0][1]?.signal;
    expect(originalSignal).toBeInstanceOf(AbortSignal);

    act(() => window.history.replaceState(null, "", "/users?search=other"));
    expect(await screen.findByRole("alert")).toHaveTextContent(/not allowed/i);
    expect(originalSignal?.aborted).toBe(true);

    await act(async () =>
      resolveStale({ data: [user], meta: { page: 1, page_size: 30, total: 31 } }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/not allowed/i);
    expect(screen.queryByText(user.email)).toBeNull();
    expect(screen.queryByText("31 results")).toBeNull();
  });

  it("keeps account creation blocked across a denied search key, repeated denial, and retry", async () => {
    let denySearch!: (error: unknown) => void;
    const forbidden = Object.assign(new Error("forbidden"), { status: 403 });
    vi.mocked(apiEnvelope)
      .mockResolvedValueOnce({ data: [user], meta: { page: 1, page_size: 30, total: 31 } })
      .mockRejectedValueOnce(forbidden)
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            denySearch = reject;
          }),
      )
      .mockResolvedValueOnce({ data: [user], meta: { page: 2, page_size: 30, total: 31 } });
    providers(<UserDirectory />);
    const create = screen.getByRole("button", { name: "Create account" });
    expect(await screen.findByRole("link", { name: /Green Member/ })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Refresh users" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/not allowed/i);

    act(() => window.history.replaceState(null, "", "/users?search=new&page=2"));
    await waitFor(() => expect(denySearch).toBeTypeOf("function"));
    expect(create).toBeDisabled();
    fireEvent.click(create);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("31 results")).toBeNull();
    expect(api).not.toHaveBeenCalled();

    await act(async () => denySearch(forbidden));
    expect(create).toBeDisabled();
    const retry = screen.getByRole("button", { name: "Try again" });
    await waitFor(() => expect(retry).toBeEnabled());
    fireEvent.click(retry);
    expect(await screen.findByRole("link", { name: /Green Member/ })).toBeVisible();
    expect(create).toBeEnabled();
    fireEvent.click(create);
    expect(screen.getByRole("dialog", { name: "Create account" })).toBeVisible();
  });

  it("keeps create unavailable on an offline first read until a valid response arrives", async () => {
    onlineManager.setOnline(false);
    vi.mocked(apiEnvelope).mockResolvedValueOnce({
      data: [user],
      meta: { page: 1, page_size: 30, total: 1 },
    });
    providers(<UserDirectory />);
    const create = screen.getByRole("button", { name: "Create account" });
    expect(await screen.findByRole("status")).toHaveTextContent(/connection/i);
    expect(create).toBeDisabled();
    expect(apiEnvelope).not.toHaveBeenCalled();
    fireEvent.click(create);
    expect(screen.queryByRole("dialog")).toBeNull();
    act(() => onlineManager.setOnline(true));
    expect(await screen.findByRole("link", { name: /Green Member/ })).toBeVisible();
    expect(create).toBeEnabled();
  });

  it("closes a pending create on denial and ignores its late result after access recovers", async () => {
    let finishCreate!: (value: unknown) => void;
    const payload = { data: [user], meta: { page: 1, page_size: 30, total: 1 } };
    vi.mocked(apiEnvelope)
      .mockResolvedValueOnce(payload)
      .mockRejectedValueOnce(Object.assign(new Error("forbidden"), { status: 403 }))
      .mockResolvedValueOnce(payload);
    vi.mocked(api).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishCreate = resolve;
        }),
    );
    providers(<UserDirectory />);
    expect(await screen.findByRole("link", { name: /Green Member/ })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    const dialog = screen.getByRole("dialog", { name: "Create account" });
    const fields = within(dialog);
    const name = "Pending Member";
    const password = "Strong-Harvest-42!";
    fireEvent.change(fields.getByLabelText("Full name"), { target: { value: name } });
    fireEvent.change(fields.getByLabelText("Login phone"), { target: { value: "0912345678" } });
    fireEvent.change(fields.getByLabelText("New password"), { target: { value: password } });
    fireEvent.change(fields.getByLabelText("Confirm password"), { target: { value: password } });
    const submit = fields.getByRole("button", { name: "Create account" });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    await waitFor(() => expect(api).toHaveBeenCalledOnce());
    const [path, request] = vi.mocked(api).mock.calls[0];
    expect(path).toBe("admin/users");
    expect(request?.method).toBe("POST");
    expect(JSON.parse(String(request?.body))).toEqual({
      name,
      login_phone_number: "+84912345678",
      password1: password,
      password2: password,
    });
    expect(fields.getByRole("button", { name: /saving/i })).toBeDisabled();

    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(/not allowed/i);
    expect(dialog).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Green Member/ })).toBeNull();
    fireEvent.submit(dialog.querySelector("form")!);
    expect(api).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("link", { name: /Green Member/ })).toBeVisible();
    await act(async () =>
      finishCreate({ id: "04d465b7-8245-4123-b1a5-4cf28e13e4d5", status: "pending_activation" }),
    );
    expect(router.push).not.toHaveBeenCalled();
    expect(screen.queryByText("Account created and pending activation.")).toBeNull();
    expect(screen.queryByRole("dialog", { name: "Create account" })).toBeNull();
    expect(screen.queryByRole("link", { name: /Pending Member/ })).toBeNull();
    expect(apiEnvelope).toHaveBeenCalledTimes(3);
    expect(api).toHaveBeenCalledOnce();
  });

  it("uses only the data-list skeleton during an uncached Users route transition", async () => {
    vi.mocked(apiEnvelope).mockImplementation(() => new Promise(() => {}));
    const { container, rerender } = providers(<UsersRouteLoading />);
    expect(container.querySelector(".mantine-Skeleton-root")).toBeNull();
    rerender(scene(<UserDirectory />));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/loading users/i));
    expect(
      screen.getByRole("table", { hidden: true }).querySelector(".mantine-Skeleton-root"),
    ).toBeInTheDocument();
    expect(container.querySelector(".mantine-Loader-root")).toBeNull();
    expect(screen.queryByText("No users found.")).toBeNull();
  });

  it("does not let an older paginated response overwrite newer user data or metadata", async () => {
    let resolveOld!: (value: { data: AdminUserListItem[]; meta: PaginationMeta }) => void;
    let resolveNew!: (value: { data: AdminUserListItem[]; meta: PaginationMeta }) => void;
    const fetcher = vi.fn(
      (requestKey: string) =>
        new Promise<{ data: AdminUserListItem[]; meta: PaginationMeta }>((resolve) => {
          if (requestKey === "old") resolveOld = resolve;
          else resolveNew = resolve;
        }),
    );
    const view = render(<PaginatedUserHarness fetcher={fetcher} requestKey="old" />);
    await waitFor(() => expect(fetcher).toHaveBeenCalledWith("old", 1));
    view.rerender(<PaginatedUserHarness fetcher={fetcher} requestKey="new" />);
    await waitFor(() => expect(fetcher).toHaveBeenCalledWith("new", 1));

    await act(async () =>
      resolveNew({
        data: [{ ...user, id: "new", name: "Newest user response" }],
        meta: { page: 1, page_size: 30, total: 2 },
      }),
    );
    expect(await screen.findByText("Newest user response")).toBeVisible();
    expect(screen.getByTestId("user-harness-total")).toHaveTextContent("2");

    await act(async () =>
      resolveOld({
        data: [{ ...user, id: "old", name: "Stale user response" }],
        meta: { page: 1, page_size: 30, total: 99 },
      }),
    );
    expect(screen.queryByText("Stale user response")).toBeNull();
    expect(screen.getByText("Newest user response")).toBeVisible();
    expect(screen.getByTestId("user-harness-total")).toHaveTextContent("2");
  });

  it("renders localized user status without profile-edit controls", async () => {
    vi.mocked(apiEnvelope).mockImplementation(async (path: string) => {
      if (path.includes("/points"))
        return { data: [], meta: { page: 1, page_size: 30, total: 0, balance: 50 } };
      return {
        data: {
          ...user,
          referral_code: "NFV1234567",
          source: "organic",
          referrer: null,
          invited_count: 0,
          invited_users: [],
        },
        meta: { invited: { page: 1, page_size: 30, total: 0 } },
      };
    });
    providers(<UserDetail userId={user.id} />);

    expect(await screen.findByText("NFV1234567")).toBeInTheDocument();
    expect(screen.getByText("Signed up on the website")).toBeInTheDocument();
    expect(screen.queryByText("Referrer")).not.toBeInTheDocument();
    const referrals = screen.getByRole("heading", { name: "Referral details" }).closest("section")!;
    const invitees = within(referrals).getByRole("region", { name: "People invited (0)" });
    expect(within(invitees).getByText("This user has not invited anyone yet.")).toBeVisible();
    expect(within(referrals).queryByRole("table")).toBeNull();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: user.name })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Users" })).toHaveAttribute("href", "/users");
    expect(screen.getByRole("link", { name: "Manage points" })).toHaveAttribute(
      "href",
      `/points/${user.id}`,
    );
    expect(screen.queryByRole("link", { name: "Points directory" })).toBeNull();
    const address = screen.getByRole("region", { name: "Address" });
    expect(await within(address).findByText("Sample Ward, Sample City")).toBeVisible();
    expect(screen.queryByText("Transaction history")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /delete|save profile/i })).not.toBeInTheDocument();
  });

  it("keeps Points directory search and server-side pagination", async () => {
    window.history.replaceState(null, "", "/points");
    vi.mocked(apiEnvelope).mockImplementation(async (path: string) => {
      const filtered = path.includes("search=green");
      const page = path.includes("page=2") ? 2 : 1;
      return {
        data: [page === 2 ? { ...user, name: "Second Page Member" } : user],
        meta: { page, page_size: 30, total: filtered ? 1 : 31 },
      };
    });
    providers(<PointsManager />);
    expect(await screen.findByText("31 results")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(
      await screen.findByRole("link", { name: "View points: Second Page Member" }),
    ).toBeVisible();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "green" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByText("1 result")).toBeVisible();
    expect(screen.getByRole("link", { name: "View points: Green Member" })).toHaveAttribute(
      "href",
      `/points/${user.id}`,
    );
    expect(vi.mocked(apiEnvelope).mock.calls.map(([path]) => path)).toEqual([
      "admin/users?page=1&search=",
      "admin/users?page=2&search=",
      "admin/users?page=1&search=green",
    ]);
  });

  it.each([
    { failure: "network_error", status: 0, canAdjust: true },
    { failure: "service_unavailable", status: 503, canAdjust: false },
  ])(
    "retries point history page three after $failure and verifies permissions again",
    async ({ failure, status, canAdjust }) => {
      let failed = false;
      const history = (page: number, allowed: boolean) => ({
        data: [
          {
            id: `transaction-${page}`,
            direction: "credit",
            amount: 1,
            message: `History page ${page}`,
            actor: null,
            created_at: "2026-07-20T02:00:00Z",
          },
        ],
        meta: { page, page_size: 30, total: 90, balance: 50, can_adjust_points: allowed },
      });
      let finishRetry!: (value: ReturnType<typeof history>) => void;
      const retry = new Promise<ReturnType<typeof history>>((resolve) => {
        finishRetry = resolve;
      });
      vi.mocked(apiEnvelope).mockImplementation(async (path) => {
        const page = Number(new URL(String(path), "https://test.local").searchParams.get("page"));
        if (page === 3) {
          if (!failed) {
            failed = true;
            throw Object.assign(new Error(failure), { status });
          }
          return retry;
        }
        return history(page, true);
      });
      providers(<PointLedger userId={user.id} userName={user.name} />);
      expect(await screen.findByText("History page 1")).toBeVisible();
      fireEvent.click(screen.getByRole("button", { name: "Next" }));
      expect(await screen.findByText("History page 2")).toBeVisible();
      fireEvent.click(screen.getByRole("button", { name: "Next" }));
      const retryButton = await screen.findByRole("button", { name: "Try again" });
      expect(screen.queryByRole("button", { name: "Create transaction" })).toBeNull();
      fireEvent.click(retryButton);
      expect(screen.queryByRole("button", { name: "Create transaction" })).toBeNull();
      await act(async () => {
        finishRetry(history(3, canAdjust));
      });
      expect(await screen.findByText("History page 3")).toBeVisible();
      expect(screen.getByRole("navigation", { name: "Page 3/3" })).toBeVisible();
      expect(Boolean(screen.queryByRole("button", { name: "Create transaction" }))).toBe(canAdjust);
      expect(vi.mocked(apiEnvelope).mock.calls.map(([path]) => path)).toEqual(
        [1, 2, 3, 3].map((page) => `admin/users/${user.id}/points?page=${page}`),
      );
    },
  );

  it("confirms a manual transaction and blocks an insufficient debit before submission", async () => {
    pointResponses(50);
    providers(<PointLedger userId={user.id} userName={user.name} />);
    await screen.findByText("Transaction history");
    selectOption(screen.getByLabelText("Direction"), "debit");
    fireEvent.change(screen.getByLabelText("Points"), { target: { value: "100" } });
    fireEvent.change(screen.getByLabelText("Message *"), {
      target: { value: "Redeem vegetables" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create transaction" }));
    expect(
      await screen.findByText("The current balance is too low for this debit."),
    ).toBeInTheDocument();
    expect(pointWrites()).toHaveLength(0);

    selectOption(screen.getByLabelText("Direction"), "credit");
    fireEvent.click(screen.getByRole("button", { name: "Create transaction" }));
    expect(await screen.findByRole("dialog", { name: "Confirm transaction" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() =>
      expect(apiEnvelope).toHaveBeenCalledWith(
        `admin/users/${user.id}/points`,
        expect.objectContaining({ method: "POST" }),
        expect.objectContaining({ allowMissingData: true }),
      ),
    );
  });

  it("retries a lost point adjustment after remount with the original payload and key", async () => {
    let attempts = 0;
    pointResponses(50, () => {
      if (++attempts === 1) throw new Error("request_timeout");
    });
    const ledger = <PointLedger userId={user.id} userName={user.name} />;
    const view = render(scene(ledger));
    fireEvent.change(await screen.findByLabelText("Message *"), {
      target: { value: "Verified adjustment" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create transaction" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm" }));
    expect(await within(screen.getByRole("dialog")).findByRole("alert")).toHaveTextContent(
      /could not be confirmed/i,
    );
    view.rerender(scene(null));
    view.rerender(scene(ledger));
    fireEvent.click(await screen.findByRole("button", { name: "Retry saved transaction" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const writes = pointWrites();
    expect(writes).toHaveLength(2);
    expect(writes[0][1]?.body).toBe(writes[1][1]?.body);
    expect(JSON.parse(String(writes[0][1]?.body)).idempotency_key).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("sanitizes point input, validates it inline, and submits a numeric amount", async () => {
    pointResponses(500);
    providers(<PointLedger userId={user.id} userName={user.name} />);
    await screen.findByText("Transaction history");

    const amount = screen.getByLabelText("Points");
    expect(amount).toHaveAttribute("type", "text");
    expect(amount).toHaveAttribute("inputmode", "numeric");
    for (const [input, expected] of [
      ["abc", ""],
      ["1e3", "13"],
      ["+1", "1"],
      ["-1", "1"],
      ["1.5", "15"],
      ["abc12e+3", "123"],
    ]) {
      fireEvent.change(amount, { target: { value: input } });
      expect(amount).toHaveValue(expected);
    }
    fireEvent.change(screen.getByLabelText("Message *"), {
      target: { value: "Manual adjustment" },
    });

    fireEvent.change(amount, { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Create transaction" }));
    expect(screen.getByText(/whole number greater than 0/i)).toBeVisible();
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.change(amount, { target: { value: "999999999999" } });
    fireEvent.click(screen.getByRole("button", { name: "Create transaction" }));
    expect(screen.getByText(/must not exceed/i)).toBeVisible();
    expect(pointWrites()).toHaveLength(0);

    fireEvent.change(amount, { target: { value: "00042" } });
    expect(amount).toHaveValue("00042");
    fireEvent.click(screen.getByRole("button", { name: "Create transaction" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(pointWrites()).toHaveLength(1));
    const payload = JSON.parse(String(pointWrites()[0][1]?.body));
    expect(payload.amount).toBe(42);
    expect(typeof payload.amount).toBe("number");
  });

  it("shows the protected target's point history without adjustment controls", async () => {
    vi.mocked(apiEnvelope).mockImplementation(async (path: string) => {
      if (path.includes("/points")) {
        return {
          data: [
            {
              id: "historical-transaction",
              direction: "credit",
              amount: 50,
              template: "manual_adjustment",
              message: "Existing ledger entry",
              actor: null,
              created_at: "2026-07-20T02:00:00Z",
            },
          ],
          meta: { page: 1, page_size: 30, total: 1, balance: 50, can_adjust_points: false },
        };
      }
      return {
        data: {
          ...user,
          referral_code: "NFV1234567",
          source: "organic",
          referrer: null,
          invited_count: 0,
          invited_users: [],
        },
        meta: { invited: { page: 1, page_size: 30, total: 0 } },
      };
    });

    providers(<PointDetail userId={user.id} />);

    expect(await screen.findByRole("heading", { name: "Point details" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Points" })).toHaveAttribute("href", "/points");
    expect(await screen.findByRole("table", { name: "Transaction history" })).toBeVisible();
    expect(screen.getByRole("row", { name: /Existing ledger entry/ })).toBeVisible();
    expect(screen.getByText(/Point balance.*50/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Create transaction" })).toBeNull();
    expect(screen.queryByLabelText("Direction")).toBeNull();
  });

  it("removes adjustment controls when the target becomes protected before confirmation", async () => {
    pointResponses(50, () => {
      throw Object.assign(new Error("account_target_protected"), { status: 409 });
    });
    providers(<PointLedger userId={user.id} userName={user.name} />);
    const message = await screen.findByLabelText("Message *");
    fireEvent.change(message, { target: { value: "Manual adjustment" } });
    fireEvent.click(screen.getByRole("button", { name: "Create transaction" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/protected account/i);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("button", { name: "Create transaction" })).toBeNull();
    expect(screen.getByText(/Point balance.*50/)).toBeVisible();
    expect(screen.getByRole("heading", { name: "Transaction history" })).toBeVisible();
  });
});
