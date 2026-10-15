import { beforeEach, describe, expect, it, vi } from "vitest";

import { deleteStoreProductImage, listStoreProducts, saveStoreProduct } from "@/lib/commerce-api";
import { fromLegacyPackageItems, toLegacyPackageItems } from "@/lib/membership-catalog-adapter";
import { categoryDescendantIds, categoryPath, categoryTreeRows } from "@/lib/store-categories";
import type { StoreCategory } from "@/lib/types";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

beforeEach(() => fetchMock.mockReset());

describe("Commerce API and compatibility adapter", () => {
  it("serializes product filters through the existing same-origin BFF", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [], meta: { page: 2, page_size: 30, total: 0 } }),
    });
    await listStoreProducts({ page: 2, search: "rau", is_active: false, csa_eligible: true });
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/backend/admin/store-products?page=2&search=rau&is_active=false&csa_eligible=true",
    );
  });

  it("keeps VND as a lossless decimal integer string in product writes", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ data: { id: "product" } }),
    });
    await saveStoreProduct({
      sku: "RAU-1",
      slug: "rau-1",
      category_id: "category",
      unit_size: "0.500",
      unit_label_vi: "kg",
      unit_label_en: "kg",
      retail_price_vnd: "9007199254740993",
      csa_quota_group_id: null,
      csa_quota_cost: 0,
      primary_image_id: null,
      is_active: true,
      is_published: false,
      translations: [],
    });
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload.retail_price_vnd).toBe("9007199254740993");
    expect(payload.csa_quota_group_id).toBeNull();
    expect(payload.csa_quota_cost).toBe(0);
  });

  it("keeps orphan-image cleanup alive while leaving the editor", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 204,
      json: async () => ({}),
    });

    await deleteStoreProductImage("image-1", { keepalive: true });

    expect(fetchMock.mock.calls[0][0]).toBe("/api/backend/admin/store-products/media/image-1");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: "DELETE",
      keepalive: true,
    });
  });

  it("maps legacy package items in one round-trip boundary", () => {
    const items = [
      {
        product_id: "quota-a",
        quota_units: 3,
        product_name: "Rau",
        short_description: "",
        unit_size: "0.500",
        unit_label_vi: "kg",
        unit_label_en: "kg",
      },
    ];
    const allowances = fromLegacyPackageItems(items);
    expect(allowances).toEqual([{ quotaGroupId: "quota-a", quotaUnits: 3 }]);
    expect(toLegacyPackageItems(allowances)).toEqual([{ product_id: "quota-a", quota_units: 3 }]);
    expect(toLegacyPackageItems([])).toEqual([]);
  });
});

const category = (id: string, parent_id: string | null, sort_order = 0): StoreCategory => ({
  id,
  parent_id,
  sort_order,
  slug: id,
  is_active: true,
  depth: 1,
  has_children: false,
  product_count: 0,
  translations: [],
  created_at: "",
  updated_at: "",
});

describe("category tree", () => {
  it("orders unordered categories by sibling order and handles a missing parent", () => {
    const rows = categoryTreeRows([
      category("leaf", "child"),
      category("orphan", "gone"),
      category("child", "root"),
      category("root", null, 2),
      category("first", null, 1),
    ]);
    expect(rows.map(({ category: item, depth }) => [item.id, depth])).toEqual([
      ["orphan", 1],
      ["first", 1],
      ["root", 1],
      ["child", 2],
      ["leaf", 3],
    ]);
    expect(
      [
        ...categoryDescendantIds(
          [category("root", null), category("child", "root"), category("leaf", "child")],
          "root",
        ),
      ].sort(),
    ).toEqual(["child", "leaf", "root"]);
  });

  it("builds the full path of a selectable category", () => {
    const categories = [
      category("produce", null),
      category("vegetables", "produce"),
      category("leafy", "vegetables"),
    ];
    expect(categoryPath(categories[2], categories, "vi")).toBe("produce → vegetables → leafy");
  });
});
