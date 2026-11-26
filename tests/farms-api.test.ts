import { beforeEach, expect, it, vi } from "vitest";

import {
  addFarmProduct,
  cancelFarmStockBatch,
  createFarmStockBatch,
  deleteFarmImage,
  getFarm,
  listFarms,
  listFarmProducts,
  listAvailableFarmProducts,
  listFarmStockBatches,
  saveFarm,
  updateFarmStockBatch,
  enableFarmTracker,
} from "@/lib/farms-api";

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
const farmProduct = {
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
  initial_quantity: 10,
  net_sold_quantity: 0,
  available_quantity: 10,
  batch_count: 1,
  active_batch_count: 1,
  has_supply_history: true,
  next_expiry_date: "2026-11-01",
};
const stockBatch = {
  id: batchId,
  farm_product_id: linkId,
  start_date: "2026-10-26",
  end_date: "2026-11-01",
  quantity_units: 10,
  net_sold_quantity: 0,
  remaining_quantity: 10,
  available_quantity: 10,
  version: 3,
  status: "active",
  created_at: "2026-10-26T00:00:00Z",
  updated_at: "2026-10-26T00:00:00Z",
};

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
  ]) {
    fetchMock.mockResolvedValueOnce(Response.json({ data }));
    await expect(updateFarmStockBatch(farmId, productId, batchId, { version: 2 })).rejects.toThrow(
      "invalid_response",
    );
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
        linkId,
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
    "/api/backend/admin/farms/farm-1/products?page=2&search=rau+mu%E1%BB%91ng",
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
  fetchMock.mockResolvedValue(Response.json({ data: farmProduct }, { status: 201 }));

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

it("lists, creates, updates, and cancels Farm stock batches through the BFF", async () => {
  fetchMock
    .mockResolvedValueOnce(Response.json({ data: [], meta: { page: 2, page_size: 20, total: 0 } }))
    .mockImplementation(() => Promise.resolve(Response.json({ data: stockBatch })));

  await listFarmStockBatches(farmId, productId, { page: 2, status: "active" });
  await createFarmStockBatch(farmId, productId, {
    start_date: "2026-10-26",
    end_date: "2026-11-01",
    quantity_units: 10,
  });
  await updateFarmStockBatch(farmId, productId, batchId, {
    version: 2,
    end_date: "2026-11-02",
    quantity_units: 12,
  });
  await cancelFarmStockBatch(farmId, productId, batchId, 3);

  const base = `/api/backend/admin/farms/${farmId}/products/${productId}/batches`;
  expect(fetchMock.mock.calls[0][0]).toBe(`${base}?page=2&status=active`);
  expect(fetchMock.mock.calls[1][0]).toBe(base);
  expect(fetchMock.mock.calls[1][1].method).toBe("POST");
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
    start_date: "2026-10-26",
    end_date: "2026-11-01",
    quantity_units: 10,
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

it("enables an existing Farm profile", async () => {
  fetchMock.mockResolvedValue(Response.json({ data: { id: "farm-1" } }));
  await enableFarmTracker("farm-1", { signup_count: 4, one_month_signup_count: 1 });
  expect(fetchMock.mock.calls[0][0]).toBe("/api/backend/admin/farms/farm-1/growth-tracker");
  expect(fetchMock.mock.calls[0][1].method).toBe("POST");
});
