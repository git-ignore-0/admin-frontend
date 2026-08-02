import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useCallback } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { PointDetail } from "@/components/point-detail";
import { PointLedger } from "@/components/point-ledger";
import { PointsManager } from "@/components/points-manager";
import { ToastProvider } from "@/components/toast-provider";
import { UserDetail } from "@/components/user-detail";
import { UserDirectory } from "@/components/user-directory";
import { api, apiEnvelope } from "@/lib/client-api";
import type { AdminUserListItem, PaginationMeta } from "@/lib/types";
import { usePaginatedList } from "@/lib/use-paginated-list";

vi.mock("@/lib/client-api", () => ({ api: vi.fn(), apiEnvelope: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  usePathname: () => "/users",
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function providers(children: React.ReactNode) {
  return render(
    <AdminI18nProvider initialLocale="en">
      <ToastProvider>{children}</ToastProvider>
    </AdminI18nProvider>,
  );
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
  phone: "+84 912 345 678",
  status: "active",
  date_joined: "2026-07-20T02:00:00Z",
  points_balance: 50,
};

describe("users and points", () => {
  it("uses the user name as the only localized detail link for Users and Points", async () => {
    vi.mocked(apiEnvelope).mockResolvedValue({
      data: [user],
      meta: { page: 1, page_size: 30, total: 1 },
    });
    const usersView = providers(<UserDirectory />);

    expect(await screen.findByText("green@example.com")).toBeInTheDocument();
    expect(screen.getByText("20/07/2026 09:00")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: `View details: ${user.name}` })).toHaveAttribute(
      "href",
      `/users/${user.id}`,
    );
    expect(screen.getAllByRole("link", { name: `View details: ${user.name}` })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "View details" })).toBeNull();

    usersView.unmount();
    providers(<PointsManager />);
    expect(await screen.findByRole("link", { name: `View points: ${user.name}` })).toHaveAttribute(
      "href",
      `/points/${user.id}`,
    );
    expect(screen.getAllByRole("link", { name: `View points: ${user.name}` })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "View points" })).toBeNull();
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
      screen.getByRole("searchbox", { name: "Search by email or phone number" }),
    ).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(apiEnvelope).toHaveBeenLastCalledWith("admin/users?page=2&search="));
    await waitFor(() => expect(screen.getByRole("searchbox")).toBeEnabled());

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: " 912 " } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() =>
      expect(apiEnvelope).toHaveBeenLastCalledWith("admin/users?page=1&search=912"),
    );
    expect(await screen.findByText("1 result")).toBeVisible();

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });
    await waitFor(() => expect(apiEnvelope).toHaveBeenLastCalledWith("admin/users?page=1&search="));
    expect(await screen.findByText("31 results")).toBeVisible();
  });

  it("keeps old users visible and disables list controls while a search is pending", async () => {
    let resolveSearch!: (value: { data: AdminUserListItem[]; meta: PaginationMeta }) => void;
    vi.mocked(apiEnvelope).mockImplementation(async (path: string) => {
      if (path.includes("search=green")) {
        return new Promise((resolve) => {
          resolveSearch = resolve;
        });
      }
      return { data: [user], meta: { page: 1, page_size: 30, total: 31 } };
    });
    providers(<UserDirectory />);

    const detailLink = await screen.findByRole("link", { name: `View details: ${user.name}` });
    const searchbox = screen.getByRole("searchbox", {
      name: "Search by email or phone number",
    });
    fireEvent.change(searchbox, { target: { value: "green" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    await waitFor(() => expect(searchbox).toBeDisabled());
    expect(detailLink).toBeVisible();
    expect(screen.getByRole("button", { name: "Searching…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    expect(screen.getByRole("navigation", { name: "Page {page}/{pages}" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(detailLink.closest("section")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Loading users…");
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

  it("renders localized user status without account-edit controls", async () => {
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
    vi.mocked(api).mockResolvedValue([]);
    providers(<UserDetail userId={user.id} />);

    expect(await screen.findByText("NFV1234567")).toBeInTheDocument();
    expect(screen.getByText("Organic signup")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "User details" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Users" })).toHaveAttribute("href", "/users");
    expect(screen.queryByText("Transaction history")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /delete|save profile/i })).not.toBeInTheDocument();
  });

  it("confirms a manual transaction and blocks an insufficient debit before submission", async () => {
    vi.mocked(apiEnvelope).mockResolvedValue({
      data: [],
      meta: { page: 1, page_size: 30, total: 0, balance: 50 },
    });
    vi.mocked(api).mockResolvedValue({
      transaction: {
        id: "transaction-id",
        direction: "credit",
        amount: 100,
        message: "Referral purchase confirmed",
        actor: null,
        created_at: "2026-07-20T02:00:00Z",
      },
      balance: 150,
    });
    providers(<PointLedger userId={user.id} userName={user.name} />);
    await screen.findByText("Transaction history");
    fireEvent.change(screen.getByLabelText("Direction"), { target: { value: "debit" } });
    fireEvent.change(screen.getByLabelText("Points"), { target: { value: "100" } });
    fireEvent.change(screen.getByLabelText("Message *"), {
      target: { value: "Redeem vegetables" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create transaction" }));
    expect(
      await screen.findByText("The current balance is too low for this debit."),
    ).toBeInTheDocument();
    expect(api).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Direction"), { target: { value: "credit" } });
    fireEvent.click(screen.getByRole("button", { name: "Create transaction" }));
    expect(await screen.findByRole("dialog", { name: "Confirm transaction" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        `admin/users/${user.id}/points`,
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });

  it("sanitizes point input, validates it inline, and submits a numeric amount", async () => {
    vi.mocked(apiEnvelope).mockResolvedValue({
      data: [],
      meta: { page: 1, page_size: 30, total: 0, balance: 500 },
    });
    vi.mocked(api).mockResolvedValue({
      transaction: {
        id: "transaction-id",
        direction: "credit",
        amount: 42,
        message: "Manual adjustment",
        actor: null,
        created_at: "2026-07-20T02:00:00Z",
      },
      balance: 542,
    });
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
    expect(api).not.toHaveBeenCalled();

    fireEvent.change(amount, { target: { value: "00042" } });
    expect(amount).toHaveValue("00042");
    fireEvent.click(screen.getByRole("button", { name: "Create transaction" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
    const payload = JSON.parse(String(vi.mocked(api).mock.calls[0][1]?.body));
    expect(payload.amount).toBe(42);
    expect(typeof payload.amount).toBe("number");
  });

  it("opens point management on a dedicated detail screen", async () => {
    vi.mocked(apiEnvelope).mockImplementation(async (path: string) => {
      if (path.includes("/points")) {
        return { data: [], meta: { page: 1, page_size: 30, total: 0, balance: 50 } };
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
    expect(screen.getByText("Transaction history")).toBeInTheDocument();
  });
});
