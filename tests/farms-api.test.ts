import { beforeEach, expect, it, vi } from "vitest";

import {
  listFarms,
  listFarmProducts,
  listAvailableFarmProducts,
  saveFarm,
  setFarmWeeklySupply,
  enableFarmTracker,
} from "@/lib/farms-api";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);
beforeEach(() => fetchMock.mockReset());

it("queries farms through the same-origin BFF with filters and pagination", async () => {
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ data: [], meta: {} }),
  });
  await listFarms({ search: "Đà Lạt", is_active: false, page: 2 });
  expect(fetchMock.mock.calls[0][0]).toBe(
    "/api/backend/admin/farms?page=2&search=%C4%90%C3%A0+L%E1%BA%A1t&is_active=false",
  );
});

it("queries linked Farm products through the BFF with server-side search and pagination", async () => {
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ data: [], meta: { page: 2, total_pages: 3 } }),
  });
  await listFarmProducts("farm-1", { page: 2, search: "rau muống" });
  expect(fetchMock.mock.calls[0][0]).toBe(
    "/api/backend/admin/farms/farm-1/products?page=2&search=rau+mu%E1%BB%91ng",
  );
});

it("queries only available Farm products with server-side search and pagination", async () => {
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ data: [], meta: { page: 2, page_size: 30, total: 31 } }),
  });
  await listAvailableFarmProducts("farm-1", { page: 2, search: "rau muống" });
  expect(fetchMock.mock.calls[0][0]).toBe(
    "/api/backend/admin/farms/farm-1/available-products?page=2&search=rau+mu%E1%BB%91ng",
  );
});

it("sends Farm version and photo IDs without sending tracker counts", async () => {
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ data: { id: "farm-1" } }),
  });
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

it("writes integer sale units to a Monday and enables an existing Farm profile", async () => {
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: {} }) });
  await setFarmWeeklySupply("farm-1", "product-1", "2026-10-19", 10);
  await enableFarmTracker("farm-1", { signup_count: 4, one_month_signup_count: 1 });
  expect(fetchMock.mock.calls[0][0]).toBe(
    "/api/backend/admin/farms/farm-1/products/product-1/weeks/2026-10-19",
  );
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ quantity_units: 10 });
  expect(fetchMock.mock.calls[1][0]).toBe("/api/backend/admin/farms/farm-1/growth-tracker");
  expect(fetchMock.mock.calls[1][1].method).toBe("POST");
});
