import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { LanguageSwitcher } from "@/components/language-switcher";
import { RedemptionDetailView } from "@/components/redemption-detail";
import { RedemptionList } from "@/components/redemption-list";
import { RewardEditor } from "@/components/reward-editor";
import { RewardList } from "@/components/reward-list";
import { ToastProvider } from "@/components/toast-provider";
import { api, apiEnvelope } from "@/lib/client-api";
import type { RedemptionDetail, Reward } from "@/lib/types";

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
  it("lists localized rewards and paginates to a dedicated editor", async () => {
    vi.mocked(apiEnvelope).mockResolvedValue({
      data: [reward],
      meta: { page: 1, page_size: 30, total: 31 },
    });
    providers(<RewardList />);

    expect(await screen.findByText("Seasonal vegetables")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Edit" })).toHaveAttribute(
      "href",
      `/rewards/${reward.id}`,
    );
    expect(screen.queryByRole("columnheader", { name: /inventory/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/out of stock/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(apiEnvelope).toHaveBeenLastCalledWith("admin/rewards?page=2"));
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
      point_cost: 100,
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

  it("reorders the current page with keyboard controls and sends all page ids", async () => {
    const second = {
      ...reward,
      id: "72bb1e57-a73b-4635-ae80-25da7499073c",
      position: 3,
      translations: reward.translations.map((item) => ({ ...item, name: "Seed box" })),
    };
    vi.mocked(apiEnvelope)
      .mockResolvedValueOnce({
        data: [reward, second],
        meta: { page: 1, page_size: 30, total: 2 },
      })
      .mockResolvedValueOnce({
        data: [second, reward],
        meta: { page: 1, page_size: 30, total: 2 },
      });
    providers(<RewardList />);

    fireEvent.click(await screen.findByRole("button", { name: "Move Seasonal vegetables down" }));

    await waitFor(() =>
      expect(apiEnvelope).toHaveBeenLastCalledWith("admin/rewards/reorder", {
        method: "POST",
        body: JSON.stringify({ page: 1, reward_ids: [second.id, reward.id] }),
      }),
    );
    expect(screen.getAllByRole("row")[1]).toHaveTextContent("Seed box");
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
  it("searches, filters and localizes redemption statuses", async () => {
    vi.mocked(apiEnvelope).mockResolvedValue({
      data: [{ ...redemption, internal_note: "Private fulfillment note" }],
      meta: { page: 1, page_size: 30, total: 1 },
    });
    providers(<RedemptionList />);

    expect(await screen.findByText("Pending")).toBeInTheDocument();
    expect(screen.queryByText("Private fulfillment note")).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "green@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() =>
      expect(apiEnvelope).toHaveBeenLastCalledWith(
        expect.stringContaining("search=green%40example.com"),
      ),
    );
    fireEvent.change(screen.getByLabelText("Filter by status"), { target: { value: "pending" } });
    await waitFor(() =>
      expect(apiEnvelope).toHaveBeenLastCalledWith(
        expect.stringContaining("search=green%40example.com&status=pending"),
      ),
    );
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
