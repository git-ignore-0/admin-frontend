import { beforeEach, expect, it, vi } from "vitest";

import { farmerProducts, type FarmerProduct } from "@/lib/farm-supply-request-api";
import {
  FarmerCatalogChanged,
  newCatalogScan,
  scanFarmerProducts,
} from "@/lib/farmer-supply-recovery";

vi.mock("@/lib/farm-supply-request-api", () => ({ farmerProducts: vi.fn() }));

const token = "s".repeat(43);
const target = "p-243";
function row(n: number): FarmerProduct {
  return {
    product_id: `p-${n}`,
    source_id: `source-${n}`,
    sku: `SKU-${n}`,
    name_vi: `Sản phẩm ${n}`,
    name_en: `Product ${n}`,
    unit_size: "1.000",
    unit_label_vi: "kg",
    unit_label_en: "kg",
    product_identity: "a".repeat(64),
    supply_generation: 1,
  };
}
function pageResponse(page: number, total: number) {
  const start = (page - 1) * 20;
  const data = Array.from({ length: Math.min(20, total - start) }, (_, i) => row(start + i + 1));
  return { data, meta: { page, page_size: 20, total } };
}

beforeEach(() => vi.resetAllMocks());

it("bounds a scan and resumes from the verified cursor before marking missing products", async () => {
  vi.mocked(farmerProducts).mockImplementation(async (_token, { page = 1 }) =>
    pageResponse(page, 250),
  );
  const scan = newCatalogScan();
  const signal = new AbortController().signal;
  const targets = new Set([target, "missing"]);
  expect(await scanFarmerProducts(token, targets, scan, signal)).toBe(false);
  expect(farmerProducts).toHaveBeenCalledTimes(12);
  expect(scan.matches.size).toBe(0);
  expect(scan.page).toBe(13);
  expect(await scanFarmerProducts(token, targets, scan, signal)).toBe(true);
  expect(scan.matches.get(target)?.page).toBe(13);
  expect(scan.matches.has("missing")).toBe(false);
  expect(farmerProducts).toHaveBeenCalledTimes(13);
});

it("retains the last verified page on network error and rejects inconsistent catalogs", async () => {
  vi.mocked(farmerProducts)
    .mockResolvedValueOnce(pageResponse(1, 30))
    .mockRejectedValueOnce(new Error("network_error"))
    .mockResolvedValueOnce(pageResponse(2, 31));
  const scan = newCatalogScan();
  const signal = new AbortController().signal;
  const targets = new Set([target]);
  await expect(scanFarmerProducts(token, targets, scan, signal)).rejects.toThrow("network_error");
  expect(scan.page).toBe(2);
  expect(scan.seen.size).toBe(20);
  await expect(scanFarmerProducts(token, targets, scan, signal)).rejects.toBeInstanceOf(
    FarmerCatalogChanged,
  );
  expect(scan.matches.size).toBe(0);
});
