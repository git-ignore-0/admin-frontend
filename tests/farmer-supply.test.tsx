import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { FarmerSupply } from "@/components/farmer-supply";
import {
  farmerFarm,
  farmerProducts,
  farmerRequest,
  farmerRequests,
  submitFarmerRequest,
  type FarmerProduct,
  type SupplyRequest,
  type SupplySubmitPayload,
} from "@/lib/farm-supply-request-api";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/toast-provider", () => ({ useToast: () => vi.fn() }));
vi.mock("@/lib/farm-supply-request-api", () => ({
  farmerFarm: vi.fn(),
  farmerProducts: vi.fn(),
  farmerRequest: vi.fn(),
  farmerRequests: vi.fn(),
  submitFarmerRequest: vi.fn(),
}));

const farmA = "A".repeat(43);
const farmB = "B".repeat(43);
const uuid = (n: number) => `b0112100-8cee-4e11-8000-${String(n).padStart(12, "0")}`;
const product = (n: number): FarmerProduct => ({
  product_id: uuid(n),
  source_id: uuid(100 + n),
  name_vi: `Sản phẩm ${n}`,
  name_en: `Product ${n}`,
  product_identity: "a".repeat(64),
  supply_generation: 2,
  sku: `SKU${n}`,
  unit_size: "0.500",
  unit_label_vi: "kg",
  unit_label_en: "kg",
});
const farm = (name: string, is_active = true) => ({ name_vi: name, name_en: name, is_active });
const first = product(1);
const pending: SupplyRequest = {
  id: uuid(500),
  code: "FSR-0001",
  start_date: "2030-02-01",
  end_date: "2030-02-05",
  submitted_at: "2030-02-01T01:00:00Z",
  processed_at: null,
  status: "pending",
  rejection_reason: null,
  items: [{ ...first, quantity_units: 4 }],
};

function fragment(value: string) {
  window.history.replaceState(null, "", `/farmer${value}`);
}
function switchFarm(token: string) {
  act(() => {
    fragment(`#token=${token}`);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
}
function renderFarmer(hash = `#token=${farmA}`) {
  fragment(hash);
  return render(
    <AdminI18nProvider initialLocale="en">
      <FarmerSupply />
    </AdminI18nProvider>,
  );
}
function apiError(code: string, status: number, context?: unknown) {
  return Object.assign(new Error(code), { status, payload: { errors: [{ code, context }] } });
}
function productPage(data: FarmerProduct[], page = 1, total = data.length) {
  return { data, meta: { page, total, page_size: 20 } };
}
function quantity(n: number) {
  return screen.findByRole("textbox", { name: `Supply quantity — Product ${n}` });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(farmerFarm).mockImplementation(async (token) =>
    farm(token === farmA ? "Farm A" : "Farm B"),
  );
  vi.mocked(farmerProducts).mockResolvedValue(productPage([first]));
  vi.mocked(farmerRequests).mockResolvedValue({
    data: [],
    meta: { page_size: 20, page: 1, total: 0 },
  });
  vi.mocked(farmerRequest).mockResolvedValue(pending);
  vi.mocked(submitFarmerRequest).mockResolvedValue({
    data: pending,
    meta: { idempotent_replay: false },
  });
});
afterEach(() => {
  cleanup();
  fragment("");
});

describe("Farmer access and scope retirement", () => {
  it.each([
    ["", "Open the product entry link shared by the farm."],
    ["#token=invalid", "This product entry link is invalid or has expired."],
  ])(
    "explains an absent or malformed fragment before requesting Farm data",
    async (hash, message) => {
      renderFarmer(hash);
      expect(await screen.findByRole("alert")).toHaveTextContent(message);
      expect(farmerFarm).not.toHaveBeenCalled();
    },
  );

  it("retires private Farm data when a request reports that the token is invalid", async () => {
    vi.mocked(farmerRequests).mockRejectedValue(apiError("invalid_farm_token", 403));
    renderFarmer();
    const input = await quantity(1);
    fireEvent.change(input, { target: { value: "7" } });
    fireEvent.click(screen.getByRole("tab", { name: "Request history" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("has expired");
    expect(screen.queryByRole("heading", { name: "Farm A" })).not.toBeInTheDocument();
    expect(input).not.toBeInTheDocument();
  });

  it("allows an inactive Farm to read history without loading the catalog or offering Submit", async () => {
    vi.mocked(farmerFarm).mockResolvedValue(farm("Farm A", false));
    renderFarmer();
    expect(await screen.findByText(/This farm is inactive/)).toBeInTheDocument();
    expect(farmerProducts).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Send request" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Request history" }));
    expect(await screen.findByText("No requests yet.")).toBeInTheDocument();
  });

  it("cancels a catalog read when the Farm changes and ignores its late rows", async () => {
    let finish: (result: ReturnType<typeof productPage>) => void = () => {};
    vi.mocked(farmerProducts).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    renderFarmer();
    await waitFor(() => expect(farmerProducts).toHaveBeenCalledTimes(1));
    const oldSignal = vi.mocked(farmerProducts).mock.calls[0][2];
    switchFarm(farmB);
    expect(await screen.findByRole("heading", { name: "Farm B" })).toBeInTheDocument();
    expect(await quantity(1)).toHaveValue("");
    expect(oldSignal?.aborted).toBe(true);
    await act(async () => finish(productPage([product(2)])));
    expect(screen.queryByText("Product 2")).not.toBeInTheDocument();
  });

  it("aborts an old-token mutation and ignores its late result after a Farm change", async () => {
    let complete: (result: Awaited<ReturnType<typeof submitFarmerRequest>>) => void = () => {};
    vi.mocked(submitFarmerRequest).mockReturnValueOnce(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    renderFarmer();
    const input = await quantity(1);
    fireEvent.change(input, { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    await waitFor(() => expect(submitFarmerRequest).toHaveBeenCalledTimes(1));
    const oldSignal = vi.mocked(submitFarmerRequest).mock.calls[0][2];
    switchFarm(farmB);
    expect(await screen.findByRole("heading", { name: "Farm B" })).toBeInTheDocument();
    expect(oldSignal?.aborted).toBe(true);
    expect(await quantity(1)).toHaveValue("");
    await act(async () => complete({ data: pending, meta: { idempotent_replay: false } }));
    expect(screen.queryByText("Request FSR-0001 was sent.")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Farm A" })).not.toBeInTheDocument();
  });
});

describe("Farmer entry and history", () => {
  it("keeps draft through search, tabs and language switches and sends the Farmer contract", async () => {
    renderFarmer();
    const input = await quantity(1);
    expect(screen.queryByText(/Remaining|Internal inventory/)).not.toBeInTheDocument();
    const send = screen.getByRole("button", { name: "Send request" });
    fireEvent.change(input, { target: { value: "10000" } });
    expect(input).toHaveValue("10000");
    expect(send).toBeEnabled();
    fireEvent.change(input, { target: { value: "10001" } });
    expect(input).toHaveValue("10000");
    expect(input).toHaveAccessibleDescription("The value must not exceed 10000.");
    expect(send).toBeDisabled();
    fireEvent.change(input, { target: { value: "4" } });
    const search = screen.getByRole("searchbox", { name: "Search products" });
    expect(search.closest("[data-grow-search]")).toContainElement(
      screen.getByRole("button", { name: "Refresh products" }),
    );
    fireEvent.change(search, { target: { value: "SKU1" } });
    fireEvent.submit(search.closest("form")!);
    await waitFor(() =>
      expect(farmerProducts).toHaveBeenLastCalledWith(
        farmA,
        { search: "SKU1", page: 1 },
        expect.any(AbortSignal),
      ),
    );
    expect(await quantity(1)).toHaveValue("4");
    fireEvent.click(screen.getByRole("tab", { name: "Request history" }));
    expect(await screen.findByText("No requests yet.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Enter products" }));
    expect(await quantity(1)).toHaveValue("4");
    fireEvent.click(screen.getByText("Tiếng Việt"));
    const localized = await screen.findByRole("textbox", {
      name: "Số lượng cung ứng — Sản phẩm 1",
    });
    expect(localized).toHaveValue("4");
    fireEvent.click(screen.getByRole("button", { name: "Gửi yêu cầu" }));
    await waitFor(() => expect(submitFarmerRequest).toHaveBeenCalledTimes(1));
    const [token, intent] = vi.mocked(submitFarmerRequest).mock.calls[0];
    expect(token).toBe(farmA);
    expect(intent.idempotency_key).toMatch(/[a-f0-9-]{36}/);
    expect(intent.items).toEqual([
      {
        product_id: first.product_id,
        expected_link_id: first.source_id,
        expected_generation: first.supply_generation,
        expected_product_identity: first.product_identity,
        quantity_units: 4,
      },
    ]);
    expect(await screen.findByText("Đã gửi yêu cầu FSR-0001.")).toBeInTheDocument();
  });

  it("preserves the identity read at entry when the catalog later returns a new snapshot", async () => {
    const updated = { ...first, product_identity: "9".repeat(64), unit_size: "1.000" };
    vi.mocked(farmerProducts)
      .mockResolvedValueOnce(productPage([first]))
      .mockResolvedValue(productPage([updated]));
    renderFarmer();
    fireEvent.change(await quantity(1), { target: { value: "4" } });
    const search = screen.getByRole("searchbox", { name: "Search products" });
    fireEvent.change(search, { target: { value: "SKU1" } });
    fireEvent.submit(search.closest("form")!);
    await waitFor(() => expect(farmerProducts).toHaveBeenCalledTimes(2));
    expect(await quantity(1)).toHaveValue("4");
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    await waitFor(() => expect(submitFarmerRequest).toHaveBeenCalledTimes(1));
    expect(vi.mocked(submitFarmerRequest).mock.calls[0][1].items[0].expected_product_identity).toBe(
      first.product_identity,
    );
  });

  it("blocks a duplicate submit and retries a rate-limited or malformed mutation with the same intent", async () => {
    let reject: (cause: unknown) => void = () => {};
    vi.mocked(submitFarmerRequest)
      .mockReturnValueOnce(
        new Promise((_resolve, fail) => {
          reject = fail;
        }),
      )
      .mockRejectedValueOnce(apiError("invalid_response", 200));
    renderFarmer();
    fireEvent.change(await quantity(1), { target: { value: "4" } });
    const submit = screen.getByRole("button", { name: "Send request" });
    fireEvent.click(submit);
    fireEvent.click(submit);
    expect(submitFarmerRequest).toHaveBeenCalledTimes(1);
    await act(async () => reject(apiError("request_failed", 429)));
    const retry = await screen.findByRole("button", { name: "Resend saved request" });
    const intent = vi.mocked(submitFarmerRequest).mock.calls[0][1];
    expect(submit).toBeDisabled();
    expect(await quantity(1)).toHaveValue("4");
    fireEvent.click(retry);
    await waitFor(() => expect(retry).not.toBeDisabled());
    expect(submitFarmerRequest).toHaveBeenCalledTimes(2);
    expect(vi.mocked(submitFarmerRequest).mock.calls[1][1]).toBe(intent);
    fireEvent.click(retry);
    expect(await screen.findByText("Request FSR-0001 was sent.")).toBeInTheDocument();
    expect(vi.mocked(submitFarmerRequest).mock.calls[2][1]).toBe(intent);
    expect(await quantity(1)).toHaveValue("");
  });

  it("loads a history detail and renders products from its saved snapshot", async () => {
    const snapshot: SupplyRequest = {
      ...pending,
      status: "rejected",
      processed_at: "2030-02-01T04:00:00Z",
      rejection_reason: "Delivery dates are unavailable.",
      items: [{ ...first, name_en: "Old catalog name", unit_size: "3.000", quantity_units: 4 }],
    };
    vi.mocked(farmerRequests).mockResolvedValue({
      data: [snapshot],
      meta: { page_size: 20, page: 1, total: 1 },
    });
    vi.mocked(farmerRequest).mockResolvedValue(snapshot);
    renderFarmer();
    await quantity(1);
    fireEvent.click(screen.getByRole("tab", { name: "Request history" }));
    fireEvent.click(await screen.findByRole("button", { name: "FSR-0001" }));
    expect(await screen.findByText("Old catalog name")).toBeInTheDocument();
    expect(screen.getByText("12 kg")).toBeInTheDocument();
    expect(screen.getByText("Rejected")).toBeInTheDocument();
    expect(screen.getByText(snapshot.rejection_reason!)).toBeInTheDocument();
    expect(farmerRequest).toHaveBeenCalledWith(farmA, snapshot.id, expect.any(AbortSignal));
    expect(submitFarmerRequest).not.toHaveBeenCalled();
  });

  it("checks all submitted products across pages and clears only quantities whose metadata changed", async () => {
    const rows = Array.from({ length: 41 }, (_, index) => product(index + 1));
    let changed = false;
    vi.mocked(farmerProducts).mockImplementation(async (_token, { page = 1 }) => {
      const visible = rows
        .slice((page - 1) * 20, page * 20)
        .map((entry) =>
          changed && entry.product_id === uuid(1)
            ? { ...entry, sku: "NEW-1", product_identity: "1".repeat(64) }
            : changed && entry.product_id === uuid(21)
              ? { ...entry, unit_size: "1.000", product_identity: "2".repeat(64) }
              : entry,
        );
      return productPage(visible, page, rows.length);
    });
    let originalIntent: SupplySubmitPayload | undefined;
    vi.mocked(submitFarmerRequest).mockImplementationOnce(async (_token, intent) => {
      originalIntent = intent;
      changed = true;
      throw apiError("product_identity_changed", 409, { item_index: 0, product_id: uuid(1) });
    });

    renderFarmer();
    fireEvent.change(await quantity(1), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.change(await quantity(21), { target: { value: "8" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.change(await quantity(41), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    expect(await screen.findByText("Product information has changed")).toBeInTheDocument();
    expect(screen.getByText("SKU changed from SKU1 to NEW-1.")).toBeInTheDocument();
    expect(screen.getByText("Sale unit changed from 0.5 kg to 1 kg.")).toBeInTheDocument();
    expect(await quantity(41)).toHaveValue("10");
    expect(screen.getByRole("button", { name: "Send request" })).toBeDisabled();
    expect(submitFarmerRequest).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Open Product 21" }));
    const affected = await quantity(21);
    await waitFor(() => expect(affected).not.toBeDisabled());
    expect(affected).toHaveValue("");
    fireEvent.change(affected, { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Open Product 1" }));
    const firstAgain = await quantity(1);
    await waitFor(() => expect(firstAgain).not.toBeDisabled());
    expect(firstAgain).toHaveValue("");
    fireEvent.change(firstAgain, { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    await waitFor(() => expect(submitFarmerRequest).toHaveBeenCalledTimes(2));
    const resubmission = vi.mocked(submitFarmerRequest).mock.calls[1][1];
    expect(resubmission.idempotency_key).not.toBe(originalIntent?.idempotency_key);
    expect(resubmission.start_date).toBe(originalIntent?.start_date);
    expect(resubmission.end_date).toBe(originalIntent?.end_date);
    expect(resubmission.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          product_id: uuid(1),
          expected_product_identity: "1".repeat(64),
          quantity_units: 3,
        }),
        expect.objectContaining({
          product_id: uuid(21),
          expected_product_identity: "2".repeat(64),
          quantity_units: 4,
        }),
        expect.objectContaining({
          product_id: uuid(41),
          expected_product_identity: "a".repeat(64),
          quantity_units: 10,
        }),
      ]),
    );
  });

  it.each([false, true])(
    "retires the removed-product review only after verified submit (replayed: %s)",
    async (replay) => {
      const retained = product(2);
      let removed = false;
      vi.mocked(farmerProducts).mockImplementation(async () =>
        productPage(removed ? [retained] : [first, retained]),
      );
      const accepted = {
        data: { ...pending, items: [{ ...retained, quantity_units: 9 }] },
        meta: { idempotent_replay: replay },
      };
      const submit = vi.mocked(submitFarmerRequest);
      submit.mockImplementationOnce(async () => {
        removed = true;
        throw apiError("farm_product_removed", 409, {
          item_index: 0,
          product_id: first.product_id,
        });
      });
      if (replay) submit.mockRejectedValueOnce(new Error("request_timeout"));
      submit.mockResolvedValueOnce(accepted);

      renderFarmer();
      fireEvent.change(await quantity(1), { target: { value: "4" } });
      fireEvent.change(await quantity(2), { target: { value: "9" } });
      fireEvent.click(screen.getByRole("button", { name: "Send request" }));
      const notice = "This product is no longer eligible for supply.";
      expect(await screen.findByText(notice)).toBeInTheDocument();
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Send request" })).toBeEnabled(),
      );
      expect(await quantity(2)).toHaveValue("9");
      fireEvent.click(screen.getByRole("button", { name: "Send request" }));
      if (replay) {
        const retry = await screen.findByRole("button", { name: "Resend saved request" });
        expect(screen.getByText(notice)).toBeInTheDocument();
        expect(await quantity(2)).toHaveValue("9");
        fireEvent.click(retry);
      }

      expect(await screen.findByText("Request FSR-0001 was sent.")).toBeInTheDocument();
      expect(screen.queryByText(notice)).not.toBeInTheDocument();
      expect(screen.queryByText("Product information has changed")).not.toBeInTheDocument();
      expect(await quantity(2)).toHaveValue("");
      const retryPayload = submit.mock.calls[1][1];
      expect(
        retryPayload.items.map(({ product_id, quantity_units }) => [product_id, quantity_units]),
      ).toEqual([[retained.product_id, 9]]);
      expect(retryPayload.start_date).toBe(submit.mock.calls[0][1].start_date);
      expect(retryPayload.end_date).toBe(submit.mock.calls[0][1].end_date);
      if (replay) expect(submit.mock.calls[2][1]).toBe(retryPayload);
    },
  );
});
