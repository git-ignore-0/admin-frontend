import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { PointDetail } from "@/components/point-detail";
import { PointLedger } from "@/components/point-ledger";
import { ToastProvider } from "@/components/toast-provider";
import { UserDetail } from "@/components/user-detail";
import { UserDirectory } from "@/components/user-directory";
import { api, apiEnvelope } from "@/lib/client-api";

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
  it("lists, searches and paginates users", async () => {
    vi.mocked(apiEnvelope).mockResolvedValue({
      data: [user],
      meta: { page: 1, page_size: 30, total: 31 },
    });
    providers(<UserDirectory />);

    expect(await screen.findByText("green@example.com")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View details" })).toHaveAttribute(
      "href",
      `/users/${user.id}`,
    );
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "912" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() =>
      expect(apiEnvelope).toHaveBeenCalledWith(expect.stringContaining("search=912")),
    );
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });
    await waitFor(() => expect(apiEnvelope).toHaveBeenLastCalledWith("admin/users?page=1&search="));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() =>
      expect(apiEnvelope).toHaveBeenCalledWith(expect.stringContaining("page=2")),
    );
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
