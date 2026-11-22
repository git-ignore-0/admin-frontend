import { beforeEach, expect, it, vi } from "vitest";

import {
  addFarmProduct,
  cancelFarmStockBatch,
  createFarmStockBatch,
  deleteFarmImage,
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
  fetchMock.mockResolvedValue(Response.json({ data: { id: "farm-1" } }));
  await saveFarm("farm-1", {
    version: 3,
    name_vi: "Nông trại Xanh",
    photo_ids: ["photo-1"],
  });
  expect(fetchMock.mock.calls[0][0]).toBe("/api/backend/admin/farms/farm-1");
  expect(fetchMock.mock.calls[0][1].method).toBe("PATCH");
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
    version: 3,
    name_vi: "Nông trại Xanh",
    photo_ids: ["photo-1"],
  });
});

it("does not treat a Farm save with a missing record ID as authoritative", async () => {
  fetchMock.mockResolvedValue(Response.json({ data: {} }, { status: 201 }));
  await expect(saveFarm(undefined, { name_vi: "Nông trại Xanh" })).rejects.toThrow(
    "invalid_response",
  );
  expect(fetchMock).toHaveBeenCalledOnce();
});

it("creates a Farm product together with its first stock batch", async () => {
  fetchMock.mockResolvedValue(Response.json({ data: { id: "link-1" } }, { status: 201 }));

  await addFarmProduct("farm-1", "product-1", {
    start_date: "2026-10-26",
    end_date: "2026-11-01",
    quantity_units: 10,
  });

  expect(fetchMock.mock.calls[0][0]).toBe("/api/backend/admin/farms/farm-1/products");
  expect(fetchMock.mock.calls[0][1].method).toBe("POST");
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
    product_id: "product-1",
    start_date: "2026-10-26",
    end_date: "2026-11-01",
    quantity_units: 10,
  });
});

it("lists, creates, updates, and cancels Farm stock batches through the BFF", async () => {
  fetchMock
    .mockResolvedValueOnce(Response.json({ data: [], meta: { page: 2, page_size: 20, total: 0 } }))
    .mockImplementation(() => Promise.resolve(Response.json({ data: { id: "batch-1" } })));

  await listFarmStockBatches("farm-1", "product-1", { page: 2, status: "active" });
  await createFarmStockBatch("farm-1", "product-1", {
    start_date: "2026-10-26",
    end_date: "2026-11-01",
    quantity_units: 10,
  });
  await updateFarmStockBatch("farm-1", "product-1", "batch-1", {
    version: 2,
    end_date: "2026-11-02",
    quantity_units: 12,
  });
  await cancelFarmStockBatch("farm-1", "product-1", "batch-1", 3);

  const base = "/api/backend/admin/farms/farm-1/products/product-1/batches";
  expect(fetchMock.mock.calls[0][0]).toBe(`${base}?page=2&status=active`);
  expect(fetchMock.mock.calls[1][0]).toBe(base);
  expect(fetchMock.mock.calls[1][1].method).toBe("POST");
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
    start_date: "2026-10-26",
    end_date: "2026-11-01",
    quantity_units: 10,
  });
  expect(fetchMock.mock.calls[2][0]).toBe(`${base}/batch-1`);
  expect(fetchMock.mock.calls[2][1].method).toBe("PATCH");
  expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({
    version: 2,
    end_date: "2026-11-02",
    quantity_units: 12,
  });
  expect(fetchMock.mock.calls[3][0]).toBe(`${base}/batch-1/cancel`);
  expect(fetchMock.mock.calls[3][1].method).toBe("POST");
  expect(JSON.parse(fetchMock.mock.calls[3][1].body)).toEqual({ version: 3 });
});

it("enables an existing Farm profile", async () => {
  fetchMock.mockResolvedValue(Response.json({ data: { id: "farm-1" } }));
  await enableFarmTracker("farm-1", { signup_count: 4, one_month_signup_count: 1 });
  expect(fetchMock.mock.calls[0][0]).toBe("/api/backend/admin/farms/farm-1/growth-tracker");
  expect(fetchMock.mock.calls[0][1].method).toBe("POST");
});
