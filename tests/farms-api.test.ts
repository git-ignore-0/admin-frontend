import { beforeEach, expect, it, vi } from "vitest";

import { apiErrorContext, isApiObject } from "@/lib/client-error";
import {
  addFarmProduct,
  cancelFarmStockBatch,
  createFarmStockBatch,
  deleteFarm,
  deleteFarmImage,
  getFarm,
  getFarmProduct,
  listFarms,
  listFarmProducts,
  listFarmProductHistory,
  listAvailableFarmProducts,
  listFarmStockBatches,
  saveFarm,
  parseFarmDeleteReasons,
  parseFarmSourceBlocker,
  readdFarmProduct,
  removeFarmProduct,
  updateFarmStockBatch,
  enableFarmTracker,
} from "@/lib/farms-api";
import type { FarmProduct, FarmStockBatch, StockBatchInput } from "@/lib/types";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);
beforeEach(() => fetchMock.mockReset());

const farmId = "11111111-1111-4111-8111-111111111111";
const productId = "22222222-2222-4222-8222-222222222222";
const linkId = "33333333-3333-4333-8333-333333333333";
const batchId = "44444444-4444-4444-8444-444444444444";
const farmImage = {
  id: batchId,
  url: "https://example.com/media/farms/photo.webp",
  width: 240,
  height: 180,
  variants: [{ url: "https://example.com/media/farms/photo-small.webp", width: 120, height: 90 }],
};
const farm = {
  id: farmId,
  name_vi: "Nông trại Xanh",
  name_en: "Green Farm",
  location_vi: "Đà Lạt",
  location_en: "Da Lat",
  description_vi: "",
  description_en: "",
  image: farmImage,
  photos: [farmImage],
  is_active: true,
  in_stock_product_count: 0,
  out_of_stock_product_count: 2,
  version: 4,
  created_at: "2026-10-26T00:00:00Z",
  updated_at: "2026-10-26T00:00:00Z",
};
const farmProduct: FarmProduct = {
  id: linkId,
  farm_id: farmId,
  product_id: productId,
  sku: "R01",
  name_vi: "Rau",
  name_en: "Greens",
  unit_size: "1.000",
  unit_label_vi: "kg",
  unit_label_en: "kg",
  product_status: "active",
  is_active: true,
  supply_status: "supplying",
  removed_at: null,
  version: 1,
  supply_generation: 1,
  initial_quantity: 10,
  net_sold_quantity: 0,
  available_quantity: 10,
  batch_count: 1,
  active_batch_count: 1,
  has_supply_history: true,
  next_expiry_date: "2026-11-01",
};
const stockBatch: FarmStockBatch = {
  id: batchId,
  farm_product_id: linkId,
  start_date: "2026-10-26",
  end_date: "2026-11-01",
  quantity_units: 10,
  net_sold_quantity: 0,
  remaining_quantity: 10,
  available_quantity: 10,
  version: 3,
  source_version: 2,
  supply_generation: 1,
  is_historical: false,
  status: "active",
  created_at: "2026-10-26T00:00:00Z",
  updated_at: "2026-10-26T00:00:00Z",
};

const batchInput: StockBatchInput = {
  start_date: stockBatch.start_date,
  end_date: stockBatch.end_date,
  quantity_units: stockBatch.quantity_units,
};
const sourceRemoved: FarmProduct = {
  ...farmProduct,
  is_active: false,
  supply_status: "removed",
  removed_at: "2026-10-26T00:00:00Z",
  version: 2,
  initial_quantity: 0,
  available_quantity: 0,
  active_batch_count: 0,
  next_expiry_date: null,
};
const sourceCapabilities = {
  can_remove: true,
  can_readd: false,
  can_create_batch: true,
  blockers: { readd: { code: "farm_product_not_removed" } },
};
const sourceDetail = { ...farmProduct, capabilities: sourceCapabilities };
const sourceHistoryEvent = {
  id: batchId,
  action: "farm.product.lifecycle_backfill",
  created_at: "2026-10-26T00:00:00Z",
  actor: null,
  context: {
    farm_id: farmId,
    product_id: productId,
    supply_generation: 1,
    provenance: "legacy_disabled_link",
    classified_at: "2026-10-26T00:00:00Z",
  },
};

const storeOrderReason = { code: "store_order", id: batchId, label: "NFV-000123" };
const supplyingProductReason = {
  code: "supplying_product",
  id: productId,
  label: "R01",
  name_vi: "Rau",
  name_en: "Greens",
};
const deleteReasons = [
  supplyingProductReason,
  storeOrderReason,
  { ...supplyingProductReason, code: "legacy_supply" },
];

it.each([
  { allowed: true, reasons: [] },
  { allowed: false, reasons: deleteReasons },
])(
  "preserves a validated delete capability consistently for GET and PATCH ($allowed)",
  async (deletion) => {
    const detail = { ...farm, capabilities: { delete: deletion } };
    const patched = { ...detail, is_active: false, version: farm.version + 1 };
    fetchMock
      .mockResolvedValueOnce(Response.json({ data: detail }))
      .mockResolvedValueOnce(Response.json({ data: patched }));
    await expect(getFarm(farmId)).resolves.toEqual(detail);
    await expect(saveFarm(farmId, { version: farm.version, is_active: false })).resolves.toEqual(
      patched,
    );
  },
);

it.each([
  null,
  { delete: { allowed: "true", reasons: [] } },
  { delete: { allowed: true } },
  { delete: { allowed: false, reasons: [] } },
  { delete: { allowed: true, reasons: [storeOrderReason] } },
  {
    delete: {
      allowed: false,
      reasons: [{ code: "supplying_product", id: productId, label: "R01" }],
    },
  },
  {
    delete: {
      allowed: false,
      reasons: [{ ...storeOrderReason, id: "wrong-id" }],
    },
  },
  { delete: { allowed: false, reasons: [{ code: "growth_tracker", id: linkId, label: "Test" }] } },
  {
    delete: {
      allowed: false,
      reasons: [storeOrderReason, { ...storeOrderReason, id: linkId }],
    },
  },
])(
  "keeps valid Farm information and omits unusable delete capabilities (%j)",
  async (capabilities) => {
    fetchMock.mockResolvedValueOnce(Response.json({ data: { ...farm, capabilities } }));
    await expect(getFarm(farmId)).resolves.toEqual(farm);

    const patched = { ...farm, version: farm.version + 1 };
    fetchMock.mockResolvedValueOnce(Response.json({ data: { ...patched, capabilities } }));
    await expect(saveFarm(farmId, { version: farm.version })).resolves.toEqual(patched);
  },
);

it("reads the same representative reason groups from a DELETE rejection", async () => {
  const error = { code: "farm_in_use", context: { reasons: deleteReasons } };
  fetchMock.mockResolvedValueOnce(Response.json({ errors: [error] }, { status: 409 }));

  const caught = await deleteFarm(farmId).catch((cause: unknown) => cause);
  const context = apiErrorContext<unknown>(caught);
  expect(isApiObject(context) && parseFarmDeleteReasons(context.reasons)).toEqual(deleteReasons);
});

it.each([
  ["missing list", undefined],
  ["non-array list", storeOrderReason],
  ["unknown code", [{ ...storeOrderReason, code: "growth_tracker" }]],
  ["malformed ID", [{ ...storeOrderReason, id: "wrong-id" }]],
  ["blank label", [{ ...storeOrderReason, label: " " }]],
  ["missing localized name", [{ ...supplyingProductReason, name_en: undefined }]],
  ["duplicate reason group", [storeOrderReason, { ...storeOrderReason, id: linkId }]],
])("rejects %s in the DELETE reasons list", (_case, reasons) => {
  expect(parseFarmDeleteReasons(reasons)).toBeUndefined();
});

it("validates source detail and passes the request signal to the BFF", async () => {
  const controller = new AbortController();
  fetchMock.mockResolvedValueOnce(Response.json({ data: sourceDetail }));
  await expect(getFarmProduct(farmId, productId, controller.signal)).resolves.toEqual(sourceDetail);
  expect(fetchMock).toHaveBeenCalledWith(
    `/api/backend/admin/farms/${farmId}/products/${productId}`,
    expect.objectContaining({ signal: controller.signal }),
  );
});

it.each([
  { product_id: batchId },
  { supply_status: "active" },
  { removed_at: "2026-10-26T00:00:00Z" },
  { supply_generation: 0 },
  { version: undefined },
  { batch_count: -1 },
  { capabilities: undefined },
  { capabilities: { ...sourceCapabilities, can_remove: "yes" } },
  { capabilities: { ...sourceCapabilities, blockers: { readd: {} } } },
])("rejects malformed source detail (%j)", async (override) => {
  fetchMock.mockResolvedValueOnce(Response.json({ data: { ...sourceDetail, ...override } }));
  await expect(getFarmProduct(farmId, productId)).rejects.toThrow("invalid_response");
});

it("preserves the order references and remaining supply reported in blocker context", async () => {
  const open = {
    code: "farm_product_has_open_allocations",
    context: { orders: [{ id: batchId, reference_code: "EX-1" }], has_more: false },
  };
  const shortfall = {
    code: "farm_product_supply_shortfall",
    context: { required_units: 10, remaining_units: 6, shortfall_units: 4 },
  };
  for (const blocker of [open, shortfall]) {
    expect(parseFarmSourceBlocker(blocker)).toEqual(blocker);
    const data = {
      ...sourceDetail,
      capabilities: {
        ...sourceCapabilities,
        can_remove: false,
        blockers: { ...sourceCapabilities.blockers, remove: blocker },
      },
    };
    fetchMock.mockResolvedValueOnce(Response.json({ data }));
    await expect(getFarmProduct(farmId, productId)).resolves.toEqual(data);
  }
  expect(
    parseFarmSourceBlocker({ ...open, context: { orders: [{ id: "free-text" }] } }),
  ).toBeUndefined();
  expect(
    parseFarmSourceBlocker({
      ...shortfall,
      context: { ...shortfall.context, shortfall_units: -1 },
    }),
  ).toBeUndefined();
});

it("fetches paginated lifecycle history with a nullable actor and migration provenance", async () => {
  const envelope = { data: [sourceHistoryEvent], meta: { page: 2, page_size: 20, total: 21 } };
  fetchMock.mockResolvedValueOnce(Response.json(envelope));
  await expect(listFarmProductHistory(farmId, productId, { page: 2 })).resolves.toEqual(envelope);
  expect(fetchMock.mock.calls[0][0]).toBe(
    `/api/backend/admin/farms/${farmId}/products/${productId}/history?page=2`,
  );
});

it.each([
  { action: "farm.legacy.unknown" },
  { actor: { id: "foreign", name: "User" } },
  { context: { farm_id: productId } },
  { context: { classified_at: "yesterday" } },
])("rejects malformed or wrongly scoped source history (%j)", async (override) => {
  fetchMock.mockResolvedValueOnce(
    Response.json({
      data: [{ ...sourceHistoryEvent, ...override }],
      meta: { page: 1, page_size: 20, total: 1 },
    }),
  );
  await expect(listFarmProductHistory(farmId, productId)).rejects.toThrow("invalid_response");
});

it("removes and re-adds a source using the original link identity and source revision", async () => {
  const readded = {
    ...farmProduct,
    version: 3,
    supply_generation: 2,
    first_batch_id: batchId,
  };
  fetchMock.mockResolvedValueOnce(Response.json({ data: sourceRemoved }));
  fetchMock.mockResolvedValueOnce(Response.json({ data: readded }));
  await expect(removeFarmProduct(farmId, productId, farmProduct)).resolves.toEqual(sourceRemoved);
  await expect(readdFarmProduct(farmId, productId, sourceRemoved, batchInput)).resolves.toEqual(
    readded,
  );

  const source = `/api/backend/admin/farms/${farmId}/products/${productId}`;
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
    `${source}/remove`,
    `${source}/re-add`,
  ]);
  expect(fetchMock.mock.calls.map(([, request]) => request.method)).toEqual(["POST", "POST"]);
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
    expected_link_id: linkId,
    expected_version: 1,
  });
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
    ...batchInput,
    expected_link_id: linkId,
    expected_version: 2,
  });
});

it.each([
  { id: batchId },
  { version: 1 },
  { supply_generation: 2 },
  { supply_status: "supplying" },
])(
  "rejects a remove response that cannot confirm the requested lifecycle change (%j)",
  async (override) => {
    fetchMock.mockResolvedValueOnce(Response.json({ data: { ...sourceRemoved, ...override } }));
    await expect(removeFarmProduct(farmId, productId, farmProduct)).rejects.toThrow(
      "invalid_response",
    );
    expect(fetchMock).toHaveBeenCalledOnce();
  },
);

it("cannot confirm a re-add that returns the previous generation or omits the first batch ID", async () => {
  const readded = {
    ...farmProduct,
    version: 3,
    supply_generation: 2,
    first_batch_id: batchId,
  };
  for (const data of [
    { ...readded, supply_generation: 1 },
    { ...readded, first_batch_id: undefined },
  ]) {
    fetchMock.mockResolvedValueOnce(Response.json({ data }));
    await expect(readdFarmProduct(farmId, productId, sourceRemoved, batchInput)).rejects.toThrow(
      "invalid_response",
    );
  }
});

it("rejects absent picker units and wrong pagination", async () => {
  const page = { page: 1, page_size: 30, total: 1 };
  fetchMock.mockResolvedValueOnce(
    Response.json({ data: [{ ...farmProduct, unit_label_en: undefined }], meta: page }),
  );
  await expect(listAvailableFarmProducts(farmId)).rejects.toThrow("invalid_response");

  fetchMock.mockResolvedValueOnce(Response.json({ data: [], meta: { ...page, page_size: 20 } }));
  await expect(listAvailableFarmProducts(farmId)).rejects.toThrow("invalid_response");
});

it("keeps backend permission errors distinct from response validation", async () => {
  fetchMock.mockResolvedValueOnce(Response.json({ detail: "Forbidden" }, { status: 403 }));
  await expect(getFarmProduct(farmId, productId)).rejects.toMatchObject({
    status: 403,
    message: "forbidden",
  });
  expect(fetchMock).toHaveBeenCalledOnce();
});

it("rejects Farm product data for a different Farm or without a supported lifecycle", async () => {
  for (const data of [
    { ...farmProduct, farm_id: productId },
    { ...farmProduct, product_status: undefined, is_published: true },
    { ...farmProduct, product_status: "published" },
    { ...farmProduct, unit_size: "x" },
  ]) {
    fetchMock.mockResolvedValueOnce(
      Response.json({
        data: [data],
        meta: { page: 1, page_size: 20, total: 1 },
      }),
    );
    await expect(listFarmProducts(farmId)).rejects.toThrow("invalid_response");
  }
});

it("rejects a 2xx stock mutation with malformed fields or a mismatched row ID", async () => {
  for (const data of [
    { ...stockBatch, id: productId },
    { ...stockBatch, end_date: "2026-02-31" },
    { ...stockBatch, remaining_quantity: "10" },
    { ...stockBatch, status: "stopped" },
    { ...stockBatch, source_version: 0 },
    { ...stockBatch, version: 2 },
    { ...stockBatch, supply_generation: 2 },
    { ...stockBatch, is_historical: true },
  ]) {
    fetchMock.mockResolvedValueOnce(Response.json({ data }));
    await expect(
      updateFarmStockBatch(farmId, productId, batchId, { version: 2 }, farmProduct),
    ).rejects.toThrow("invalid_response");
  }
});

it("forwards the inventory signal and rejects stock rows from another Farm link", async () => {
  const controller = new AbortController();
  fetchMock.mockResolvedValueOnce(
    Response.json({
      data: [{ ...stockBatch, farm_product_id: productId }],
      meta: { page: 1, page_size: 20, total: 1 },
    }),
  );
  await expect(
    listFarmStockBatches(
      farmId,
      productId,
      {},
      {
        signal: controller.signal,
        source: farmProduct,
      },
    ),
  ).rejects.toThrow("invalid_response");
  expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal);
});

it("cleans up Farm media on HTTP 204 with keepalive and no JSON parsing", async () => {
  const response = new Response(null, { status: 204 });
  const readJson = vi.spyOn(response, "json");
  fetchMock.mockResolvedValueOnce(response);
  await expect(deleteFarmImage("image-1", { keepalive: true })).resolves.toBeUndefined();
  expect(readJson).not.toHaveBeenCalled();
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/backend/admin/farms/media/image-1",
    expect.objectContaining({ method: "DELETE", keepalive: true }),
  );
});

it("queries farms through the same-origin BFF with filters and pagination", async () => {
  fetchMock.mockResolvedValue(
    Response.json({ data: [], meta: { page: 2, page_size: 20, total: 0 } }),
  );
  await listFarms({ search: "Đà Lạt", is_active: false, page: 2 });
  expect(fetchMock.mock.calls[0][0]).toBe(
    "/api/backend/admin/farms?page=2&search=%C4%90%C3%A0+L%E1%BA%A1t&is_active=false",
  );
});

it("rejects missing pagination metadata from the Farm collection", async () => {
  fetchMock.mockResolvedValue(Response.json({ data: [] }));
  await expect(listFarms()).rejects.toThrow("invalid_response");
});

it("rejects a Farm page with an invalid record despite valid metadata", async () => {
  fetchMock.mockResolvedValue(
    Response.json({
      data: [{}],
      meta: { page: 1, page_size: 20, total: 1 },
    }),
  );
  await expect(listFarms()).rejects.toThrow("invalid_response");
});

it("queries linked Farm products through the BFF with server-side search and pagination", async () => {
  fetchMock.mockResolvedValue(
    Response.json({ data: [], meta: { page: 2, page_size: 20, total: 40 } }),
  );
  await listFarmProducts("farm-1", { page: 2, search: "rau muống" });
  expect(fetchMock.mock.calls[0][0]).toBe(
    "/api/backend/admin/farms/farm-1/products?page=2&supply_status=supplying&search=rau+mu%E1%BB%91ng",
  );
});

it("queries only available Farm products with server-side search and pagination", async () => {
  fetchMock.mockResolvedValue(
    Response.json({ data: [], meta: { page: 2, page_size: 30, total: 31 } }),
  );
  await listAvailableFarmProducts("farm-1", { page: 2, search: "rau muống" });
  expect(fetchMock.mock.calls[0][0]).toBe(
    "/api/backend/admin/farms/farm-1/available-products?page=2&search=rau+mu%E1%BB%91ng",
  );
});

it("sends Farm version and photo IDs without sending tracker counts", async () => {
  fetchMock.mockResolvedValue(Response.json({ data: farm }));
  await expect(
    saveFarm(farmId, {
      version: 3,
      name_vi: "Nông trại Xanh",
      photo_ids: [farmImage.id],
    }),
  ).resolves.toEqual(farm);
  expect(fetchMock.mock.calls[0][0]).toBe(`/api/backend/admin/farms/${farmId}`);
  expect(fetchMock.mock.calls[0][1].method).toBe("PATCH");
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
    version: 3,
    name_vi: "Nông trại Xanh",
    photo_ids: [farmImage.id],
  });
});

it("accepts a valid Farm create response and a legacy cover without gallery entries", async () => {
  const created = { ...farm, version: 1 };
  const legacy = { ...farm, photos: [] };
  fetchMock.mockResolvedValueOnce(Response.json({ data: created }, { status: 201 }));
  fetchMock.mockResolvedValueOnce(Response.json({ data: legacy }));
  await expect(saveFarm(undefined, { name_vi: created.name_vi })).resolves.toEqual(created);
  await expect(getFarm(farmId)).resolves.toEqual(legacy);
});

it("accepts legacy incomplete translations when reading or changing only the Farm status", async () => {
  const legacy = { ...farm, name_en: "", location_en: "" };
  fetchMock.mockResolvedValueOnce(Response.json({ data: legacy }));
  await expect(getFarm(farmId)).resolves.toEqual(legacy);

  const deactivated = { ...legacy, is_active: false, version: 5 };
  fetchMock.mockResolvedValueOnce(Response.json({ data: deactivated }));
  await expect(saveFarm(farmId, { version: 4, is_active: false })).resolves.toEqual(deactivated);
});

it("rejects a successful Farm save that returns missing identification entered by the admin", async () => {
  const data = { ...farm, name_en: "" };
  fetchMock.mockResolvedValueOnce(Response.json({ data }));
  await expect(saveFarm(farmId, { version: 3, name_en: "Green Farm" })).rejects.toThrow(
    "invalid_response",
  );
  fetchMock.mockResolvedValueOnce(Response.json({ data }, { status: 201 }));
  await expect(saveFarm(undefined, { name_en: "Green Farm" })).rejects.toThrow("invalid_response");
});

it.each([
  { id: productId },
  { version: 0 },
  { version: "4" },
  { photos: null },
  { photos: [{ ...farmImage, id: "foreign" }] },
  { image: { ...farmImage, variants: [null] } },
  { description_en: null },
  { name_vi: undefined },
  { location_en: undefined },
  { is_active: "true" },
])("rejects malformed or mismatched Farm detail and PATCH responses (%j)", async (override) => {
  const data = { ...farm, ...override };
  fetchMock.mockResolvedValueOnce(Response.json({ data }));
  await expect(getFarm(farmId)).rejects.toThrow("invalid_response");
  fetchMock.mockResolvedValueOnce(Response.json({ data }));
  await expect(saveFarm(farmId, { version: 3 })).rejects.toThrow("invalid_response");
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it("does not confirm a PATCH from a version at or below its expected version", async () => {
  fetchMock.mockResolvedValueOnce(Response.json({ data: farm }));
  await expect(saveFarm(farmId, { version: farm.version })).rejects.toThrow("invalid_response");
  expect(fetchMock).toHaveBeenCalledOnce();
});

it("does not treat a Farm save with a missing record ID as authoritative", async () => {
  fetchMock.mockResolvedValue(Response.json({ data: {} }, { status: 201 }));
  await expect(saveFarm(undefined, { name_vi: "Nông trại Xanh" })).rejects.toThrow(
    "invalid_response",
  );
  expect(fetchMock).toHaveBeenCalledOnce();
});

it("creates a Farm product together with its first stock batch", async () => {
  fetchMock.mockResolvedValue(
    Response.json({ data: { ...farmProduct, first_batch_id: batchId } }, { status: 201 }),
  );

  await addFarmProduct(farmId, productId, {
    start_date: "2026-10-26",
    end_date: "2026-11-01",
    quantity_units: 10,
  });

  expect(fetchMock.mock.calls[0][0]).toBe(`/api/backend/admin/farms/${farmId}/products`);
  expect(fetchMock.mock.calls[0][1].method).toBe("POST");
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
    product_id: productId,
    start_date: "2026-10-26",
    end_date: "2026-11-01",
    quantity_units: 10,
  });
});

it("writes only the appropriate source or batch revision and accepts a newer source snapshot after editing", async () => {
  fetchMock
    .mockResolvedValueOnce(Response.json({ data: [], meta: { page: 2, page_size: 20, total: 0 } }))
    .mockResolvedValueOnce(Response.json({ data: { ...stockBatch, version: 1 } }))
    .mockResolvedValueOnce(
      Response.json({
        data: { ...stockBatch, quantity_units: 12, end_date: "2026-11-02", source_version: 4 },
      }),
    )
    .mockResolvedValueOnce(
      Response.json({
        data: {
          ...stockBatch,
          status: "cancelled",
          available_quantity: 0,
          version: 4,
          source_version: 4,
        },
      }),
    );

  await listFarmStockBatches(
    farmId,
    productId,
    { page: 2, status: "active", scope: "current" },
    { source: farmProduct },
  );
  await createFarmStockBatch(farmId, productId, batchInput, farmProduct);
  await updateFarmStockBatch(
    farmId,
    productId,
    batchId,
    {
      version: 2,
      end_date: "2026-11-02",
      quantity_units: 12,
    },
    farmProduct,
  );
  await cancelFarmStockBatch(farmId, productId, batchId, 3, farmProduct);

  const base = `/api/backend/admin/farms/${farmId}/products/${productId}/batches`;
  expect(fetchMock.mock.calls[0][0]).toBe(`${base}?page=2&scope=current&status=active`);
  expect(fetchMock.mock.calls[1][0]).toBe(base);
  expect(fetchMock.mock.calls[1][1].method).toBe("POST");
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
    expected_link_id: linkId,
    expected_version: farmProduct.version,
    ...batchInput,
  });
  expect(fetchMock.mock.calls[2][0]).toBe(`${base}/${batchId}`);
  expect(fetchMock.mock.calls[2][1].method).toBe("PATCH");
  expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({
    version: 2,
    end_date: "2026-11-02",
    quantity_units: 12,
  });
  expect(fetchMock.mock.calls[3][0]).toBe(`${base}/${batchId}/cancel`);
  expect(fetchMock.mock.calls[3][1].method).toBe("POST");
  expect(JSON.parse(fetchMock.mock.calls[3][1].body)).toEqual({ version: 3 });
});

it("accepts historical batches with active date status but keeps them out of current scope", async () => {
  const data = { ...stockBatch, is_historical: true, available_quantity: 0, source_version: 3 };
  const envelope = { data: [data], meta: { page: 1, page_size: 20, total: 1 } };
  const readded: FarmProduct = { ...farmProduct, version: 3, supply_generation: 2 };
  fetchMock.mockResolvedValueOnce(Response.json(envelope));
  await expect(
    listFarmStockBatches(farmId, productId, { scope: "history" }, { source: readded }),
  ).resolves.toEqual(envelope);
  fetchMock.mockResolvedValueOnce(Response.json(envelope));
  await expect(
    listFarmStockBatches(farmId, productId, { scope: "current" }, { source: readded }),
  ).rejects.toThrow("invalid_response");
});

it("enables an existing Farm profile", async () => {
  fetchMock.mockResolvedValue(Response.json({ data: { id: "farm-1" } }));
  await enableFarmTracker("farm-1", { signup_count: 4, one_month_signup_count: 1 });
  expect(fetchMock.mock.calls[0][0]).toBe("/api/backend/admin/farms/farm-1/growth-tracker");
  expect(fetchMock.mock.calls[0][1].method).toBe("POST");
});
