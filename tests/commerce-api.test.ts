import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  deleteStoreProductImage,
  getStoreProduct,
  getStoreProductCreation,
  transitionStoreProduct,
  listStoreCategories,
  listStoreProducts,
  saveStoreProduct,
} from "@/lib/commerce-api";
import { fromLegacyPackageItems, toLegacyPackageItems } from "@/lib/membership-catalog-adapter";
import { categoryDescendantIds, categoryPath, categoryTreeRows } from "@/lib/store-categories";
import type { StoreCategory } from "@/lib/types";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

beforeEach(() => fetchMock.mockReset());

const productId = "24803641-2dce-4cac-8fc4-91e55f03e95f";
const categoryId = "87703641-2dce-4cac-8fc4-91e55f03e95f";
const productResponse = {
  version: 1,
  id: productId,
  category_id: categoryId,
  category_slug: "rau",
  sku: "RAU-1",
  slug: "rau-1",
  status: "draft",
  unit_size: "0.500",
  unit_label_vi: "kg",
  unit_label_en: "kg",
  retail_price_vnd: "9007199254740993",
  csa_quota_group_id: null,
  csa_quota_group: null,
  csa_quota_cost: 0,
  primary_image_id: null,
  primary_image: null,
  created_at: "2026-11-26T00:00:00Z",
  updated_at: "2026-11-26T00:00:00Z",
  translations: [{ locale: "vi", name: "Rau", description: "", short_description: "" }],
};
const capability = { allowed: true, reasons: [] };
const capabilities = { edit_identity: capability, edit_csa: capability, delete: capability };

describe("Commerce API and compatibility adapter", () => {
  it("accepts an empty unpaginated category response", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ data: [] }));
    await expect(listStoreCategories()).resolves.toEqual([]);
  });

  it("rejects an object in place of an unpaginated category list", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ data: {} }));
    await expect(listStoreCategories()).rejects.toThrow("invalid_response");
  });

  it("rejects a malformed category record in an unpaginated response", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ data: [null] }));
    await expect(listStoreCategories()).rejects.toThrow("invalid_response");
  });

  it("rejects a product save without an identifier", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ data: {} }, { status: 201 }));
    const payload = {
      sku: "RAU-1",
      category_id: "category",
      unit_size: "0.500",
      unit_label_vi: "kg",
      unit_label_en: "kg",
      retail_price_vnd: "1000",
      csa_quota_group_id: null,
      csa_quota_cost: 0,
      primary_image_id: null,
      translations: [],
    };
    await expect(saveStoreProduct(payload)).rejects.toThrow("invalid_response");
  });

  it("recognizes a committed Product creation whose Product was subsequently deleted", async () => {
    const key = "7b4950c1-940f-4279-b0c2-f56b17d9ff0c";
    const envelope = {
      data: null,
      meta: {
        action_receipt: { action: "create_product", resource_id: productId, idempotency_key: key },
      },
    };
    fetchMock
      .mockResolvedValueOnce(Response.json(envelope))
      .mockResolvedValueOnce(Response.json(envelope));
    await expect(saveStoreProduct({ sku: "RAU-1", idempotency_key: key })).resolves.toEqual({
      id: productId,
      removed: true,
    });
    await expect(getStoreProductCreation(key)).resolves.toEqual({ id: productId, removed: true });
    expect(fetchMock.mock.calls[1][0]).toBe(
      `/api/backend/admin/store-products?creation_key=${key}`,
    );
    expect(fetchMock.mock.calls[1][1].method).toBeUndefined();
  });

  it("serializes product filters through the existing same-origin BFF", async () => {
    fetchMock.mockResolvedValue(
      Response.json({ data: [], meta: { page: 2, page_size: 30, total: 0 } }),
    );
    await listStoreProducts({ page: 2, search: "rau", status: "discontinued", csa_eligible: true });
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/backend/admin/store-products?page=2&search=rau&status=discontinued&csa_eligible=true",
    );
  });

  it("verifies only the requested products against a complete order catalog response", async () => {
    const query = { order_kind: "new", product_ids: [productId, categoryId] } as const;
    const valid = {
      data: [{ ...productResponse, status: "active", retail_price_vnd: "10000" }],
      meta: { page: 1, page_size: 50, total: 1 },
    };
    fetchMock.mockResolvedValueOnce(Response.json(valid));
    await expect(listStoreProducts(query)).resolves.toEqual(valid);
    expect(fetchMock.mock.calls[0][0]).toBe(
      `/api/backend/admin/store-products?page=1&order_kind=new&product_ids=${productId}%2C${categoryId}`,
    );
    fetchMock.mockResolvedValueOnce(Response.json({ ...valid, meta: { ...valid.meta, total: 2 } }));
    await expect(listStoreProducts(query)).rejects.toThrow("invalid_response");
  });

  it("keeps VND as a lossless decimal integer string in product writes", async () => {
    fetchMock.mockResolvedValue(
      Response.json({ data: { ...productResponse, capabilities } }, { status: 201 }),
    );
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
      translations: [],
    });
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload.retail_price_vnd).toBe("9007199254740993");
    expect(payload.csa_quota_group_id).toBeNull();
    expect(payload.csa_quota_cost).toBe(0);
  });

  it("validates list rows and page metadata and forwards the request signal", async () => {
    const controller = new AbortController();
    const meta = { page: 2, page_size: 30, total: 31 };
    fetchMock.mockResolvedValueOnce(Response.json({ data: [productResponse], meta }));
    await expect(listStoreProducts({ page: 2 }, controller.signal)).resolves.toMatchObject({
      meta,
    });
    expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal);
    fetchMock.mockResolvedValueOnce(
      Response.json({ data: [productResponse], meta: { ...meta, page: 1 } }),
    );
    await expect(listStoreProducts({ page: 2 })).rejects.toThrow("invalid_response");
    fetchMock.mockResolvedValueOnce(
      Response.json({ data: [{ ...productResponse, status: "published" }], meta }),
    );
    await expect(listStoreProducts({ page: 2 })).rejects.toThrow("invalid_response");
  });

  it.each([
    {},
    { capabilities: { ...capabilities, edit_identity: { allowed: "true", reasons: [] } } },
    { capabilities: { ...capabilities, delete: { allowed: false, reasons: [null] } } },
    { capabilities, id: categoryId },
    { capabilities, retail_price_vnd: 1000 },
    { capabilities, unit_size: "invalid" },
    { capabilities, translations: [{ locale: "fr", name: "Rau" }] },
    { capabilities, csa_quota_cost: "0" },
  ])("rejects malformed or misbound product detail %#", async (patch) => {
    fetchMock.mockResolvedValueOnce(Response.json({ data: { ...productResponse, ...patch } }));
    await expect(getStoreProduct(productId)).rejects.toThrow("invalid_response");
  });

  it("accepts a valid detail with localized reason metadata and rejects incomplete mutations", async () => {
    const detail = {
      ...productResponse,
      capabilities: {
        ...capabilities,
        delete: {
          allowed: false,
          reasons: [
            { code: "farm_link", farm_id: categoryId, farm_name_vi: "Vườn", farm_name_en: "Farm" },
          ],
        },
      },
    };
    fetchMock.mockResolvedValueOnce(Response.json({ data: detail }));
    await expect(getStoreProduct(productId)).resolves.toEqual(detail);
    fetchMock.mockResolvedValueOnce(Response.json({ data: { ...detail, id: categoryId } }));
    await expect(saveStoreProduct({ sku: "RAU-1" }, productId)).rejects.toThrow("invalid_response");
    fetchMock.mockResolvedValueOnce(Response.json({ data: detail }));
    await expect(transitionStoreProduct(productId, "draft", "active", 1)).rejects.toThrow(
      "invalid_response",
    );
    fetchMock.mockResolvedValueOnce(Response.json({ data: { ...detail, status: "active" } }));
    await expect(transitionStoreProduct(productId, "draft", "active", 1)).resolves.toMatchObject({
      status: "active",
    });
  });

  it("keeps orphan-image cleanup alive while leaving the editor", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

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
