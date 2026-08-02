import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useCallback } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { LanguageSwitcher } from "@/components/language-switcher";
import { RedemptionDetailView } from "@/components/redemption-detail";
import { RedemptionList } from "@/components/redemption-list";
import { RewardEditor } from "@/components/reward-editor";
import { RewardList } from "@/components/reward-list";
import { ToastProvider } from "@/components/toast-provider";
import { api, apiEnvelope } from "@/lib/client-api";
import type { PaginationMeta, RedemptionDetail, RedemptionListItem, Reward } from "@/lib/types";
import { usePaginatedList } from "@/lib/use-paginated-list";

const replace = vi.fn();

vi.mock("@/lib/client-api", () => ({ api: vi.fn(), apiEnvelope: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh: vi.fn() }),
  usePathname: () => "/rewards",
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

function PaginatedRedemptionHarness({
  fetcher,
  requestKey,
}: {
  fetcher: (
    requestKey: string,
    page: number,
  ) => Promise<{ data: RedemptionListItem[]; meta: PaginationMeta }>;
  requestKey: string;
}) {
  const fetchPage = useCallback((page: number) => fetcher(requestKey, page), [fetcher, requestKey]);
  const getErrorMessage = useCallback(() => "load failed", []);
  const { items, meta } = usePaginatedList({ fetchPage, getErrorMessage });
  return (
    <div>
      {items?.map((item) => (
        <span key={item.id}>{item.user.name}</span>
      ))}
      {meta && <span data-testid="redemption-harness-total">{meta.total}</span>}
    </div>
  );
}

function PaginatedRewardHarness({
  fetcher,
  requestKey,
}: {
  fetcher: (requestKey: string, page: number) => Promise<{ data: Reward[]; meta: PaginationMeta }>;
  requestKey: string;
}) {
  const fetchPage = useCallback((page: number) => fetcher(requestKey, page), [fetcher, requestKey]);
  const getErrorMessage = useCallback(() => "load failed", []);
  const { items, meta } = usePaginatedList({ fetchPage, getErrorMessage });
  return (
    <div>
      {items?.map((item) => (
        <span key={item.id}>{item.translations[1]?.name}</span>
      ))}
      {meta && <span data-testid="reward-harness-total">{meta.total}</span>}
    </div>
  );
}

const media = {
  id: "6a75b03f-dcb2-4f3e-9bc2-ce441601093e",
  url: "http://localhost:8000/media/rewards/reward.webp",
  width: 640,
  height: 480,
  variants: [],
};

const reward: Reward = {
  id: "ef43e453-3177-49ed-80aa-a3ba68d39e29",
  point_cost: 250,
  image: media,
  position: 2,
  is_active: true,
  translations: [
    { locale: "vi", name: "Rau theo mùa", short_description: "Rau tươi" },
    { locale: "en", name: "Seasonal vegetables", short_description: "Fresh produce" },
  ],
  created_at: "2026-07-20T02:00:00Z",
  updated_at: "2026-07-20T02:00:00Z",
};

const secondReward: Reward = {
  ...reward,
  id: "72bb1e57-a73b-4635-ae80-25da7499073c",
  position: 3,
  translations: reward.translations.map((item) => ({ ...item, name: "Seed box" })),
};

const redemption: RedemptionDetail = {
  id: "1025dad7-1599-401e-a9e3-7d2c5d3ca4db",
  reward_id: reward.id,
  reward_name_vi_snapshot: "Rau theo mùa",
  reward_name_en_snapshot: "Seasonal vegetables",
  point_cost_snapshot: 250,
  status: "pending",
  rejection_message: "",
  user: {
    id: "58cbea40-4749-4400-9fa3-188de573abaf",
    name: "Green Member",
    email: "green@example.com",
    phone: "+84 912 345 678",
  },
  created_at: "2026-07-20T02:00:00Z",
  contacted_at: null,
  completed_at: null,
  rejected_at: null,
  updated_at: "2026-07-20T02:00:00Z",
  points_balance: 50,
  debit_transaction: {
    id: "debit-id",
    direction: "debit",
    amount: 250,
    template: "reward_redemption",
    message: "Reward redemption: Seasonal vegetables",
    created_at: "2026-07-20T02:00:00Z",
  },
  refund_transaction: null,
  contacted_by: null,
  processed_by: null,
  internal_note: "",
};

describe("rewards", () => {
  it("shows no initial count and uses each reward name as the only detail link", async () => {
    let resolveList!: (value: { data: Reward[]; meta: PaginationMeta }) => void;
    vi.mocked(apiEnvelope).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveList = resolve;
        }),
    );
    providers(<RewardList />);

    expect(screen.queryByText(/\d+ results?/)).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Loading rewards…");
    await act(async () =>
      resolveList({
        data: [reward, secondReward],
        meta: { page: 1, page_size: 30, total: 2 },
      }),
    );

    expect(await screen.findByRole("link", { name: "Edit: Seasonal vegetables" })).toHaveAttribute(
      "href",
      `/rewards/${reward.id}`,
    );
    expect(screen.getAllByRole("link", { name: "Edit: Seasonal vegetables" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.getByText("2 results")).toBeVisible();
    expect(screen.queryByRole("columnheader", { name: /inventory/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/out of stock/i)).not.toBeInTheDocument();
  });

  it("keeps the current rewards visible and disables controls during a pending page load", async () => {
    let resolvePage!: (value: { data: Reward[]; meta: PaginationMeta }) => void;
    vi.mocked(apiEnvelope).mockImplementation(async (path: string) => {
      if (path.endsWith("page=2")) {
        return new Promise((resolve) => {
          resolvePage = resolve;
        });
      }
      return {
        data: [reward, secondReward],
        meta: { page: 1, page_size: 30, total: 31 },
      };
    });
    providers(<RewardList />);

    const detailLink = await screen.findByRole("link", { name: "Edit: Seasonal vegetables" });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(apiEnvelope).toHaveBeenLastCalledWith("admin/rewards?page=2"));
    expect(detailLink).toBeVisible();
    expect(detailLink.closest("section")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Loading rewards…");
    expect(
      screen.getByRole("button", { name: "Drag to reorder Seasonal vegetables" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Seasonal vegetables down" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    expect(screen.getByRole("navigation", { name: "Page {page}/{pages}" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(screen.getByText("31 results")).toBeVisible();

    await act(async () =>
      resolvePage({
        data: [secondReward],
        meta: { page: 2, page_size: 30, total: 31 },
      }),
    );
    expect(await screen.findByRole("link", { name: "Edit: Seed box" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Edit: Seasonal vegetables" })).toBeNull();
  });

  it("ignores stale reward list data and metadata", async () => {
    let resolveOld!: (value: { data: Reward[]; meta: PaginationMeta }) => void;
    let resolveNew!: (value: { data: Reward[]; meta: PaginationMeta }) => void;
    const fetcher = vi.fn(
      (requestKey: string) =>
        new Promise<{ data: Reward[]; meta: PaginationMeta }>((resolve) => {
          if (requestKey === "old") resolveOld = resolve;
          else resolveNew = resolve;
        }),
    );
    const view = render(<PaginatedRewardHarness fetcher={fetcher} requestKey="old" />);
    await waitFor(() => expect(fetcher).toHaveBeenCalledWith("old", 1));
    view.rerender(<PaginatedRewardHarness fetcher={fetcher} requestKey="new" />);
    await waitFor(() => expect(fetcher).toHaveBeenCalledWith("new", 1));

    await act(async () =>
      resolveNew({
        data: [secondReward],
        meta: { page: 1, page_size: 30, total: 2 },
      }),
    );
    expect(await screen.findByText("Seed box")).toBeVisible();
    expect(screen.getByTestId("reward-harness-total")).toHaveTextContent("2");

    await act(async () =>
      resolveOld({
        data: [reward],
        meta: { page: 1, page_size: 30, total: 99 },
      }),
    );
    expect(screen.queryByText("Seasonal vegetables")).toBeNull();
    expect(screen.getByText("Seed box")).toBeVisible();
    expect(screen.getByTestId("reward-harness-total")).toHaveTextContent("2");
  });

  it("retries a failed list load on the current page and shows a singular count", async () => {
    vi.mocked(apiEnvelope)
      .mockRejectedValueOnce(new Error("network_error"))
      .mockResolvedValueOnce({
        data: [reward],
        meta: { page: 1, page_size: 30, total: 1 },
      });
    providers(<RewardList />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not connect");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("link", { name: "Edit: Seasonal vegetables" })).toBeVisible();
    expect(screen.getByText("1 result")).toBeVisible();
    expect(apiEnvelope).toHaveBeenNthCalledWith(2, "admin/rewards?page=1");
  });

  it("uploads an image and creates a bilingual reward only once on rapid submit", async () => {
    let resolveCreate!: (value: Reward) => void;
    const createPromise = new Promise<Reward>((resolve) => {
      resolveCreate = resolve;
    });
    vi.mocked(api).mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === "admin/rewards/media") return media;
      if (path === "admin/rewards" && init?.method === "POST") return createPromise;
      throw new Error("unexpected_request");
    });
    const view = providers(<RewardEditor />);

    const pointCost = screen.getByLabelText("Point cost *");
    expect(pointCost).toHaveAttribute("type", "text");
    expect(pointCost).toHaveAttribute("inputmode", "numeric");
    fireEvent.change(pointCost, { target: { value: "abc00120e+" } });
    expect(pointCost).toHaveValue("00120");

    fireEvent.change(screen.getAllByLabelText("Reward name *")[0], {
      target: { value: "Rau theo mùa" },
    });
    fireEvent.change(screen.getAllByLabelText("Reward name *")[1], {
      target: { value: "Seasonal vegetables" },
    });
    const fileInput = view.container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, {
      target: { files: [new File(["image"], "reward.png", { type: "image/png" })] },
    });
    expect(api).not.toHaveBeenCalled();

    const save = screen.getByRole("button", { name: "Save reward" });
    fireEvent.click(save);
    fireEvent.click(save);
    await waitFor(() => expect(api).toHaveBeenCalledWith("admin/rewards/media", expect.anything()));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        "admin/rewards",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    const createCall = vi
      .mocked(api)
      .mock.calls.find(([path, init]) => path === "admin/rewards" && init?.method === "POST");
    expect(JSON.parse(String(createCall?.[1]?.body))).toEqual({
      point_cost: 120,
      image_id: media.id,
      is_active: true,
      translations: [
        { locale: "vi", name: "Rau theo mùa", short_description: "" },
        { locale: "en", name: "Seasonal vegetables", short_description: "" },
      ],
    });
    expect(screen.queryByLabelText(/quantity/i)).not.toBeInTheDocument();
    expect(
      vi
        .mocked(api)
        .mock.calls.filter(([path, init]) => path === "admin/rewards" && init?.method === "POST"),
    ).toHaveLength(1);

    await act(async () => resolveCreate(reward));
    await waitFor(() => expect(replace).toHaveBeenCalledWith(`/rewards/${reward.id}`));
    expect(save).toBeDisabled();
    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute("aria-disabled", "true");
  });

  it("blocks empty, zero, and out-of-range reward point costs inline", () => {
    providers(<RewardEditor />);
    const pointCost = screen.getByLabelText("Point cost *");
    const save = screen.getByRole("button", { name: "Save reward" });

    fireEvent.change(pointCost, { target: { value: "abc" } });
    expect(pointCost).toHaveValue("");
    fireEvent.click(save);
    expect(screen.getByText("Enter a value.")).toBeVisible();

    fireEvent.change(pointCost, { target: { value: "0" } });
    fireEvent.click(save);
    expect(screen.getByText(/whole number greater than 0/i)).toBeVisible();

    fireEvent.change(pointCost, { target: { value: "999999999999" } });
    fireEvent.click(save);
    expect(screen.getByText(/must not exceed/i)).toBeVisible();
    expect(api).not.toHaveBeenCalled();
  });

  it("loads and updates both translations without a delete action", async () => {
    vi.mocked(api)
      .mockResolvedValueOnce(reward)
      .mockResolvedValueOnce({
        ...reward,
        translations: reward.translations.map((item) =>
          item.locale === "en" ? { ...item, name: "Updated reward" } : item,
        ),
      });
    providers(<RewardEditor rewardId={reward.id} />);

    const englishName = (await screen.findAllByLabelText("Reward name *"))[1];
    fireEvent.change(englishName, { target: { value: "Updated reward" } });
    fireEvent.click(screen.getByRole("button", { name: "Save reward" }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        `admin/rewards/${reward.id}`,
        expect.objectContaining({ method: "PATCH" }),
      ),
    );
    const updateCall = vi
      .mocked(api)
      .mock.calls.find(
        ([path, init]) => path === `admin/rewards/${reward.id}` && init?.method === "PATCH",
      );
    expect(JSON.parse(String(updateCall?.[1]?.body))).toEqual({
      point_cost: reward.point_cost,
      image_id: media.id,
      is_active: true,
      translations: [
        { locale: "vi", name: "Rau theo mùa", short_description: "Rau tươi" },
        { locale: "en", name: "Updated reward", short_description: "Fresh produce" },
      ],
    });
    expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
  });

  it("optimistically reorders with the existing payload and locks every reorder control", async () => {
    let resolveReorder!: (value: { data: Reward[]; meta: PaginationMeta }) => void;
    vi.mocked(apiEnvelope).mockImplementation(async (path: string) => {
      if (path === "admin/rewards/reorder") {
        return new Promise((resolve) => {
          resolveReorder = resolve;
        });
      }
      return {
        data: [reward, secondReward],
        meta: { page: 1, page_size: 30, total: 31 },
      };
    });
    providers(<RewardList />);

    fireEvent.click(await screen.findByRole("button", { name: "Move Seasonal vegetables down" }));

    await waitFor(() =>
      expect(apiEnvelope).toHaveBeenLastCalledWith("admin/rewards/reorder", {
        method: "POST",
        body: JSON.stringify({ page: 1, reward_ids: [secondReward.id, reward.id] }),
      }),
    );
    expect(screen.getAllByRole("row")[1]).toHaveTextContent("Seed box");
    expect(screen.getByRole("status")).toHaveTextContent("Saving order…");
    expect(screen.getByRole("button", { name: "Drag to reorder Seed box" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Drag to reorder Seed box" })).toHaveAttribute(
      "draggable",
      "false",
    );
    expect(screen.getByRole("button", { name: "Move Seed box down" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Seasonal vegetables up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Move Seed box down" }));
    expect(apiEnvelope).toHaveBeenCalledTimes(2);

    await act(async () =>
      resolveReorder({
        data: [secondReward, reward],
        meta: { page: 1, page_size: 30, total: 31 },
      }),
    );
    expect(screen.getAllByRole("row")[1]).toHaveTextContent("Seed box");
    expect(screen.queryByText("Saving order…")).toBeNull();
  });

  it("rolls back the exact previous order when reorder fails", async () => {
    vi.mocked(apiEnvelope)
      .mockResolvedValueOnce({
        data: [reward, secondReward],
        meta: { page: 1, page_size: 30, total: 2 },
      })
      .mockRejectedValueOnce(new Error("network_error"));
    providers(<RewardList />);

    fireEvent.click(await screen.findByRole("button", { name: "Move Seasonal vegetables down" }));
    expect(screen.getAllByRole("row")[1]).toHaveTextContent("Seed box");
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not connect");
    expect(screen.getAllByRole("row")[1]).toHaveTextContent("Seasonal vegetables");
    expect(screen.getAllByRole("row")[2]).toHaveTextContent("Seed box");
  });

  it("rolls back and shows the dedicated conflict message", async () => {
    vi.mocked(apiEnvelope)
      .mockResolvedValueOnce({
        data: [reward, secondReward],
        meta: { page: 1, page_size: 30, total: 2 },
      })
      .mockRejectedValueOnce(new Error("reward_reorder_conflict"));
    providers(<RewardList />);

    fireEvent.click(await screen.findByRole("button", { name: "Move Seasonal vegetables down" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The reward list just changed. Reload the page before reordering again.",
    );
    expect(screen.getAllByRole("row")[1]).toHaveTextContent("Seasonal vegetables");
    expect(screen.getAllByRole("row")[2]).toHaveTextContent("Seed box");
  });

  it("does not overwrite unsaved reward fields when the admin locale changes", async () => {
    vi.mocked(api).mockResolvedValue(reward);
    providers(
      <>
        <LanguageSwitcher />
        <RewardEditor rewardId={reward.id} />
      </>,
    );

    const englishName = (await screen.findAllByLabelText("Reward name *"))[1];
    fireEvent.change(englishName, { target: { value: "Unsaved reward name" } });
    fireEvent.click(screen.getByRole("button", { name: "VI" }));

    await waitFor(() => expect(document.documentElement.lang).toBe("vi"));
    expect(englishName).toHaveValue("Unsaved reward name");
    expect(api).toHaveBeenCalledTimes(1);
  });

  it("keeps a failed reward load read-only and supports an explicit retry", async () => {
    vi.mocked(api).mockRejectedValueOnce(new Error("network_error")).mockResolvedValueOnce(reward);
    providers(<RewardEditor rewardId={reward.id} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not connect");
    expect(screen.queryByRole("button", { name: "Save reward" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect((await screen.findAllByLabelText("Reward name *"))[0]).toHaveValue("Rau theo mùa");
    expect(api).toHaveBeenCalledTimes(2);
  });
});

describe("redemptions", () => {
  it("uses the member name as the only detail link and does not show a count before loading", async () => {
    let resolveList!: (value: { data: RedemptionListItem[]; meta: PaginationMeta }) => void;
    vi.mocked(apiEnvelope).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveList = resolve;
        }),
    );
    providers(<RedemptionList />);

    expect(screen.queryByText(/\d+ results?/)).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Loading redemptions…");
    await act(async () =>
      resolveList({
        data: [redemption],
        meta: { page: 1, page_size: 30, total: 1 },
      }),
    );

    expect(await screen.findByText("Pending", { selector: ".badge" })).toBeInTheDocument();
    expect(screen.getByText("Seasonal vegetables")).toBeInTheDocument();
    expect(screen.queryByText("Private fulfillment note")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: `View details: ${redemption.user.name}` }),
    ).toHaveAttribute("href", `/redemptions/${redemption.id}`);
    expect(
      screen.getAllByRole("link", { name: `View details: ${redemption.user.name}` }),
    ).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "View details" })).toBeNull();
    expect(screen.getByText("1 result")).toBeVisible();
  });

  it("searches and filters from page one, then clears all filters", async () => {
    vi.mocked(apiEnvelope).mockImplementation(async (path: string) => ({
      data: [redemption],
      meta: {
        page: path.includes("page=2") ? 2 : 1,
        page_size: 30,
        total: path.includes("status=pending") ? 1 : 31,
      },
    }));
    providers(<RedemptionList />);

    expect(await screen.findByText("31 results")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() =>
      expect(apiEnvelope).toHaveBeenLastCalledWith("admin/redemptions?page=2&search=&status="),
    );
    await waitFor(() => expect(screen.getByRole("searchbox")).toBeEnabled());

    fireEvent.change(screen.getByRole("searchbox", { name: "Search by email or phone number" }), {
      target: { value: " green@example.com " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() =>
      expect(apiEnvelope).toHaveBeenLastCalledWith(
        "admin/redemptions?page=1&search=green%40example.com&status=",
      ),
    );
    await waitFor(() => expect(screen.getByLabelText("Filter by status")).toBeEnabled());
    fireEvent.change(screen.getByLabelText("Filter by status"), { target: { value: "pending" } });
    await waitFor(() =>
      expect(apiEnvelope).toHaveBeenLastCalledWith(
        "admin/redemptions?page=1&search=green%40example.com&status=pending",
      ),
    );
    expect(await screen.findByText("1 result")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() =>
      expect(apiEnvelope).toHaveBeenLastCalledWith("admin/redemptions?page=1&search=&status="),
    );
    expect(screen.getByRole("searchbox")).toHaveValue("");
    expect(screen.getByLabelText("Filter by status")).toHaveValue("");
    expect(await screen.findByText("31 results")).toBeVisible();
  });

  it("keeps old requests visible and disables accessible controls while a filter is pending", async () => {
    let resolveFiltered!: (value: { data: RedemptionListItem[]; meta: PaginationMeta }) => void;
    vi.mocked(apiEnvelope).mockImplementation(async (path: string) => {
      if (path.includes("status=contacted")) {
        return new Promise((resolve) => {
          resolveFiltered = resolve;
        });
      }
      return { data: [redemption], meta: { page: 1, page_size: 30, total: 31 } };
    });
    providers(<RedemptionList />);

    const detailLink = await screen.findByRole("link", {
      name: `View details: ${redemption.user.name}`,
    });
    const searchbox = screen.getByRole("searchbox", {
      name: "Search by email or phone number",
    });
    const statusFilter = screen.getByRole("combobox", { name: "Filter by status" });
    fireEvent.change(statusFilter, { target: { value: "contacted" } });

    await waitFor(() => expect(statusFilter).toBeDisabled());
    expect(detailLink).toBeVisible();
    expect(searchbox).toBeDisabled();
    expect(screen.getByRole("button", { name: "Searching…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    expect(screen.getByRole("navigation", { name: "Page {page}/{pages}" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(detailLink.closest("section")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Loading redemptions…");
    expect(screen.getByText("31 results")).toBeVisible();

    await act(async () =>
      resolveFiltered({
        data: [
          {
            ...redemption,
            id: "contacted-redemption",
            status: "contacted",
            user: { ...redemption.user, name: "Contacted Member" },
          },
        ],
        meta: { page: 1, page_size: 30, total: 1 },
      }),
    );
    expect(
      await screen.findByRole("link", { name: "View details: Contacted Member" }),
    ).toBeVisible();
    expect(screen.getByText("1 result")).toBeVisible();
  });

  it("ignores a stale redemption response and its metadata", async () => {
    let resolveOld!: (value: { data: RedemptionListItem[]; meta: PaginationMeta }) => void;
    let resolveNew!: (value: { data: RedemptionListItem[]; meta: PaginationMeta }) => void;
    const fetcher = vi.fn(
      (requestKey: string) =>
        new Promise<{ data: RedemptionListItem[]; meta: PaginationMeta }>((resolve) => {
          if (requestKey === "old") resolveOld = resolve;
          else resolveNew = resolve;
        }),
    );
    const view = render(<PaginatedRedemptionHarness fetcher={fetcher} requestKey="old" />);
    await waitFor(() => expect(fetcher).toHaveBeenCalledWith("old", 1));
    view.rerender(<PaginatedRedemptionHarness fetcher={fetcher} requestKey="new" />);
    await waitFor(() => expect(fetcher).toHaveBeenCalledWith("new", 1));

    await act(async () =>
      resolveNew({
        data: [
          {
            ...redemption,
            id: "new-redemption",
            user: { ...redemption.user, name: "Newest redemption" },
          },
        ],
        meta: { page: 1, page_size: 30, total: 2 },
      }),
    );
    expect(await screen.findByText("Newest redemption")).toBeVisible();
    expect(screen.getByTestId("redemption-harness-total")).toHaveTextContent("2");

    await act(async () =>
      resolveOld({
        data: [
          {
            ...redemption,
            id: "stale-redemption",
            user: { ...redemption.user, name: "Stale redemption" },
          },
        ],
        meta: { page: 1, page_size: 30, total: 99 },
      }),
    );
    expect(screen.queryByText("Stale redemption")).toBeNull();
    expect(screen.getByText("Newest redemption")).toBeVisible();
    expect(screen.getByTestId("redemption-harness-total")).toHaveTextContent("2");
  });

  it("shows a list error and retries the same redemption query", async () => {
    vi.mocked(apiEnvelope)
      .mockRejectedValueOnce(new Error("network_error"))
      .mockResolvedValueOnce({
        data: [redemption],
        meta: { page: 1, page_size: 30, total: 1 },
      });
    providers(<RedemptionList />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not connect");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("link", { name: `View details: ${redemption.user.name}` }),
    ).toBeVisible();
    expect(apiEnvelope).toHaveBeenNthCalledWith(2, "admin/redemptions?page=1&search=&status=");
  });

  it("marks a request as contacted without sending point or status fields", async () => {
    vi.mocked(api)
      .mockResolvedValueOnce(redemption)
      .mockResolvedValueOnce({
        redemption: {
          ...redemption,
          status: "contacted",
          contacted_at: "2026-07-21T02:00:00Z",
        },
      });
    providers(<RedemptionDetailView redemptionId={redemption.id} />);

    const contactButton = await screen.findByRole("button", { name: "Mark contacted" });
    contactButton.focus();
    fireEvent.click(contactButton);
    const dialog = screen.getByRole("dialog", { name: "Confirm contact" });
    fireEvent.change(within(dialog).getByRole("textbox"), {
      target: { value: "Called the member" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm contact" }));

    await waitFor(() => expect(screen.getByText("Contacted")).toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "Seasonal vegetables" })).toHaveFocus();
    const actionCall = vi.mocked(api).mock.calls.find(([path]) => path.endsWith("/mark-contacted"));
    expect(actionCall?.[0]).toBe(`admin/redemptions/${redemption.id}/mark-contacted`);
    expect(JSON.parse(String(actionCall?.[1]?.body))).toEqual({
      internal_note: "Called the member",
    });
  });

  it("explains action consequences, traps a rapid reject, and blocks dismissal while loading", async () => {
    let resolveReject!: (value: { redemption: RedemptionDetail }) => void;
    const rejectPromise = new Promise<{ redemption: RedemptionDetail }>((resolve) => {
      resolveReject = resolve;
    });
    vi.mocked(api).mockImplementation(async (path: string, init?: RequestInit) => {
      if (!init) return redemption;
      if (path.endsWith("/reject")) return rejectPromise;
      throw new Error("unexpected_request");
    });
    providers(<RedemptionDetailView redemptionId={redemption.id} />);

    const contactButton = await screen.findByRole("button", { name: "Mark contacted" });
    contactButton.focus();
    fireEvent.click(contactButton);
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "points were deducted when the request was submitted",
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(contactButton).toHaveFocus();

    fireEvent.click(screen.getByRole("button", { name: "Confirm completion" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("will not be deducted again");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    fireEvent.click(screen.getByRole("button", { name: "Reject and refund" }));
    const dialog = screen.getByRole("dialog", { name: "Confirm rejection and refund" });
    expect(dialog).toHaveTextContent("refund exactly 250 points to Green Member");
    const confirm = within(dialog).getByRole("button", { name: "Reject and refund" });
    expect(confirm).toBeDisabled();
    fireEvent.change(within(dialog).getAllByRole("textbox")[0], {
      target: { value: "Reward is unavailable" },
    });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        `admin/redemptions/${redemption.id}/reject`,
        expect.objectContaining({ method: "POST" }),
      ),
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(vi.mocked(api).mock.calls.filter(([path]) => path.endsWith("/reject"))).toHaveLength(1);

    await act(async () =>
      resolveReject({
        redemption: {
          ...redemption,
          status: "rejected",
          rejection_message: "Reward is unavailable",
          rejected_at: "2026-07-21T02:00:00Z",
          refund_transaction: {
            ...redemption.debit_transaction!,
            id: "refund-id",
            direction: "credit",
            template: "reward_refund",
          },
        },
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByText("Rejected")).toBeInTheDocument();
  });

  it("reloads the latest state and prevents retry after a 409 conflict", async () => {
    vi.mocked(api)
      .mockResolvedValueOnce(redemption)
      .mockRejectedValueOnce(
        Object.assign(new Error("redemption_transition_conflict"), { status: 409 }),
      )
      .mockResolvedValueOnce({ ...redemption, status: "completed" });
    providers(<RedemptionDetailView redemptionId={redemption.id} />);

    fireEvent.click(await screen.findByRole("button", { name: "Confirm completion" }));
    const dialog = screen.getByRole("dialog", { name: "Confirm completion" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm completion" }));
    expect(
      await screen.findByText(
        "Another administrator already processed this request. The latest state was loaded.",
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Confirm completion" })).toBeDisabled();
    expect(api).toHaveBeenCalledTimes(3);
  });

  it("locks stale actions when the refresh after a 409 also fails", async () => {
    vi.mocked(api)
      .mockResolvedValueOnce(redemption)
      .mockRejectedValueOnce(
        Object.assign(new Error("redemption_transition_conflict"), { status: 409 }),
      )
      .mockRejectedValueOnce(new Error("network_error"))
      .mockResolvedValueOnce({ ...redemption, status: "completed" });
    providers(<RedemptionDetailView redemptionId={redemption.id} />);

    fireEvent.click(await screen.findByRole("button", { name: "Confirm completion" }));
    const dialog = screen.getByRole("dialog", { name: "Confirm completion" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm completion" }));
    expect(
      await within(dialog).findByText(/latest state could not be loaded/i),
    ).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("button", { name: "Confirm completion" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Completed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm completion" })).not.toBeInTheDocument();
  });
});
