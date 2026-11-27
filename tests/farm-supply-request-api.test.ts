import { afterEach, describe, expect, it, vi } from "vitest";

import {
  adminSupplyRequest,
  decideSupplyRequest,
  farmerLink,
  farmerProducts,
  submitFarmerRequest,
} from "@/lib/farm-supply-request-api";
import { parseFarmDeleteReasons } from "@/lib/farms-api";

const id = "87703641-2dce-4cac-8fc4-91e55f03e95f";
const farmId = "17703641-2dce-4cac-8fc4-91e55f03e95f";
const token = "A".repeat(43);
const product = {
  product_id: id,
  sku: "VEG",
  name_vi: "Rau",
  name_en: "Vegetable",
  unit_size: "0.500",
  unit_label_vi: "kg",
  unit_label_en: "kg",
};
const row = {
  ...product,
  source_id: farmId,
  supply_generation: 1,
  product_identity: "a".repeat(64),
};
const period = { start_date: "2030-01-01", end_date: "2030-01-07" };
const entry = {
  ...period,
  id,
  code: "FSR-100",
  status: "pending",
  submitted_at: "2026-11-27T23:17:04.128340+00:00",
  processed_at: null,
  rejection_reason: null,
  items: [{ ...product, quantity_units: 2 }],
};
const adminEntry = {
  ...entry,
  farm: { id: farmId, name_vi: "Trang trại", name_en: "Farm", is_active: true },
  processed_by_id: null,
  items: [
    {
      ...entry.items[0],
      source_id: farmId,
      source_generation: 1,
      source_version: 1,
      stock_batch_id: null,
    },
  ],
};

function nextResponse(body: unknown, status = 200) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body, { status })));
}

afterEach(() => vi.unstubAllGlobals());

describe("Farmer and Admin request contracts", () => {
  it("validates Farmer Product metadata and keeps credentials out of paths", async () => {
    nextResponse({ data: [row], meta: { page: 2, page_size: 20, total: 30 } });
    await expect(farmerProducts(token, { page: 2, search: "Rau" })).resolves.toMatchObject({
      data: [row],
    });
    expect(fetch).toHaveBeenCalledWith(
      "/api/farmer/products?page=2&search=Rau",
      expect.objectContaining({ credentials: "omit", headers: { "X-Farm-Token": token } }),
    );
    for (const invalid of [
      { ...row, product_identity: "BAD" },
      { ...row, unit_size: "0.000" },
      { ...row, source_id: "other" },
      { ...row, supply_generation: "1" },
    ]) {
      nextResponse({ data: [invalid], meta: { page: 1, page_size: 20, total: 1 } });
      await expect(farmerProducts(token, {})).rejects.toThrow("invalid_response");
    }
  });

  it("requires response metadata that confirms the submitted payload", async () => {
    const payload = {
      ...period,
      idempotency_key: id,
      items: [
        {
          product_id: id,
          expected_link_id: farmId,
          expected_generation: 1,
          expected_product_identity: row.product_identity,
          quantity_units: 2,
        },
      ],
    };
    nextResponse({ data: entry, meta: { idempotent_replay: false } }, 201);
    await expect(submitFarmerRequest(token, payload)).resolves.toMatchObject({ data: entry });
    expect(fetch).toHaveBeenCalledWith(
      "/api/farmer/supply-requests",
      expect.objectContaining({ method: "POST", body: JSON.stringify(payload) }),
    );
    nextResponse({ data: entry }, 201);
    await expect(submitFarmerRequest(token, payload)).rejects.toThrow("invalid_response");
    nextResponse(
      { data: { ...entry, start_date: "2030-02-31" }, meta: { idempotent_replay: false } },
      201,
    );
    await expect(submitFarmerRequest(token, payload)).rejects.toThrow("invalid_response");
    nextResponse(
      {
        errors: [{ code: "product_identity_changed", context: { item_index: 0, product_id: id } }],
      },
      409,
    );
    await expect(submitFarmerRequest(token, payload)).rejects.toMatchObject({
      message: "product_identity_changed",
      status: 409,
      payload: { errors: [{ context: { product_id: id } }] },
    });
  });

  it("checks Admin action, detail identity, timestamp and batch trace", async () => {
    nextResponse({ data: adminEntry });
    await expect(adminSupplyRequest(id)).resolves.toEqual(adminEntry);
    nextResponse({ data: { ...adminEntry, id: farmId } });
    await expect(adminSupplyRequest(id)).rejects.toThrow("invalid_response");
    nextResponse({ data: { ...adminEntry, submitted_at: "2026-11-27T24:01:00Z" } });
    await expect(adminSupplyRequest(id)).rejects.toThrow("invalid_response");
    nextResponse({
      data: {
        ...adminEntry,
        status: "approved",
        processed_at: entry.submitted_at,
      },
      meta: { idempotent_replay: false },
    });
    await expect(decideSupplyRequest(id, "approve", { idempotency_key: farmId })).rejects.toThrow(
      "invalid_response",
    );
    nextResponse({
      data: {
        ...adminEntry,
        status: "rejected",
        processed_at: entry.submitted_at,
        rejection_reason: "Test",
      },
      meta: { idempotent_replay: true },
    });
    await expect(
      decideSupplyRequest(id, "reject", { idempotency_key: farmId, reason: "Test" }),
    ).resolves.toMatchObject({ meta: { idempotent_replay: true } });
  });

  it("only accepts the current Farm link and recognizes its deletion reference", async () => {
    const url = `/farmer#token=${token}`;
    nextResponse({ data: { farm_id: farmId, url } });
    await expect(farmerLink(farmId, "create")).resolves.toEqual({ farm_id: farmId, url });
    for (const link of [
      { farm_id: id, url },
      { farm_id: farmId, url: `https://elsewhere.test${url}` },
      { farm_id: farmId, url: `${url}&redirect=x` },
    ]) {
      nextResponse({ data: link });
      await expect(farmerLink(farmId, "rotate")).rejects.toThrow("invalid_response");
    }
    expect(
      parseFarmDeleteReasons([{ code: "farm_supply_request", id, label: entry.code }]),
    ).toEqual([{ code: "farm_supply_request", id, label: entry.code }]);
  });
});
