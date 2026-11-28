import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createAdminStoreOrder,
  quoteAdminStoreOrder,
  recoverAdminStoreOrder,
  type StoreOrderQuoteInput,
} from "@/lib/admin-store-order-api";

const buyer = "22222222-2222-4222-8222-222222222222";
const product = "11111111-1111-4111-8111-111111111111";
const key = "33333333-3333-4333-8333-333333333333";
const order = "44444444-4444-4444-8444-444444444444";
const confirmation = "a".repeat(64);
const guest = {
  recipient_name: "Người nhận",
  phone_number: "+84901234567",
  province_code: "66",
  ward_code: "22015",
  address: "12 Nguyễn Huệ",
};
const input = {
  kind: "new",
  buyer_user_id: buyer,
  delivery_date: "2026-11-28",
  lines: [{ product_id: product, quantity: 2 }],
  locale: "en",
  include_line_snapshot: true,
} satisfies StoreOrderQuoteInput;
const line = {
  product_id: product,
  name: "Quoted Tomato",
  sku: "TOMATO-CURRENT",
  unit_size: "1.000",
  unit_label: "kg",
  quantity: 2,
  unit_price_vnd: "45000",
  subtotal_vnd: "90000",
  available_quantity: 10,
};
const quote = {
  delivery_date: "2026-11-28",
  shipping_address: guest,
  shipping_address_version: "b".repeat(64),
  shipping_discount_reason: null,
  subtotal_vnd: "90000",
  shipping_fee_vnd: "30000",
  total_vnd: "120000",
  lines: [line],
  confirmation,
};
const receipt = { action: "create_store_order", idempotency_key: key, resource_id: order };
const createInput = { ...input, confirmation, idempotency_key: key };

function respond(payload: unknown, status = 200) {
  const fetch = vi.fn().mockImplementation(async () => Response.json(payload, { status }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

afterEach(() => vi.unstubAllGlobals());

describe("Admin Store order quote contract", () => {
  it("posts the exact quote body via the same-origin BFF", async () => {
    const fetch = respond({ data: quote });
    const signal = new AbortController().signal;

    await expect(quoteAdminStoreOrder(input, signal)).resolves.toEqual(quote);
    expect(fetch).toHaveBeenCalledOnce();
    const [url, request] = fetch.mock.calls[0];
    expect(url).toBe("/api/backend/admin/store-orders/quote");
    expect(request.method).toBe("POST");
    expect(request.signal).toBe(signal);
    expect(JSON.parse(request.body)).toEqual(input);
    expect(JSON.parse(request.body).include_line_snapshot).toBe(true);
    expect(new Headers(request.headers).get("x-nfv-admin-request")).toBe("1");
  });

  it("retains the exact maximum historical amount and null availability", async () => {
    const historical = {
      kind: "historical",
      guest,
      delivery_date: "2026-11-27",
      include_line_snapshot: true,
      shipping_fee_vnd: "0001",
      lines: [{ product_id: product, quantity: 1, unit_price_vnd: "9007199254740990" }],
    } satisfies StoreOrderQuoteInput;
    const historicalQuote = {
      ...quote,
      delivery_date: "2026-11-27",
      shipping_address_version: null,
      subtotal_vnd: "9007199254740990",
      shipping_fee_vnd: "1",
      total_vnd: "9007199254740991",
      lines: [
        {
          ...line,
          quantity: 1,
          unit_price_vnd: "9007199254740990",
          subtotal_vnd: "9007199254740990",
          available_quantity: null,
        },
      ],
    };
    respond({ data: historicalQuote });

    await expect(quoteAdminStoreOrder(historical)).resolves.toEqual(historicalQuote);

    respond({ data: { ...historicalQuote, shipping_fee_vnd: "0", total_vnd: "9007199254740990" } });
    await expect(quoteAdminStoreOrder(historical)).rejects.toThrow("invalid_response");
  });

  it.each([
    { delivery_date: "2026-11-29" },
    { confirmation: "unsigned" },
    { shipping_address_version: null },
    { shipping_address: { ...guest, address: "" } },
    { shipping_address: { ...guest, access_token: "unexpected" } },
    { shipping_discount_reason: "unknown" },
    { shipping_discount_reason: "csa_companion_delivery" },
    { guest_access_token: "unexpected" },
    { total_vnd: "-120000" },
    { total_vnd: "9007199254740992" },
    { subtotal_vnd: "91000", total_vnd: "121000" },
    { shipping_fee_vnd: 30000 },
    { lines: [] },
    { lines: [line, line] },
    { lines: [{ ...line, product_id: buyer }] },
    { lines: [{ ...line, quantity: 1 }] },
    { lines: [{ ...line, available_quantity: null }] },
    { lines: [{ ...line, available_quantity: 1 }] },
    { lines: [{ ...line, unit_price_vnd: "1" }] },
  ])("rejects a malformed or mismatched successful quote response %j", async (overrides) => {
    respond({ data: { ...quote, ...overrides } });

    await expect(quoteAdminStoreOrder(input)).rejects.toThrow("invalid_response");
  });
});

describe("Admin Store order creation receipt", () => {
  it.each([201, 200])(
    "posts the confirmed input and uses a verified receipt for HTTP %s",
    async (status) => {
      const fetch = respond(
        {
          data: { id: order, lines: "unreadable" },
          meta: { action_receipt: receipt, idempotent_replay: status === 200 },
        },
        status,
      );

      await expect(createAdminStoreOrder(createInput)).resolves.toEqual({ id: order });
      expect(fetch).toHaveBeenCalledOnce();
      const [url, request] = fetch.mock.calls[0];
      expect(url).toBe("/api/backend/admin/store-orders");
      expect(request.method).toBe("POST");
      expect(JSON.parse(request.body)).toEqual(createInput);
    },
  );

  it("recovers the receipt by UUID even if the order projection is missing", async () => {
    const fetch = respond({ meta: { action_receipt: receipt, idempotent_replay: true } });
    const signal = new AbortController().signal;

    await expect(recoverAdminStoreOrder(key, signal)).resolves.toEqual({ id: order });
    expect(fetch).toHaveBeenCalledWith(
      `/api/backend/admin/store-orders?creation_key=${key}`,
      expect.objectContaining({ signal }),
    );
    expect(fetch.mock.calls[0][1].method).toBeUndefined();
  });

  it.each([
    { data: { id: order } },
    { meta: { action_receipt: { ...receipt, action: "create_product" } } },
    { meta: { action_receipt: { ...receipt, idempotency_key: buyer } } },
    { meta: { action_receipt: { ...receipt, resource_id: "bad" } } },
    { data: { id: buyer }, meta: { action_receipt: receipt } },
  ])("rejects an unverified receipt or a different usable projection ID %j", async (payload) => {
    respond(payload);

    await expect(createAdminStoreOrder(createInput)).rejects.toThrow("invalid_response");
    await expect(recoverAdminStoreOrder(key)).rejects.toThrow("invalid_response");
  });

  it("preserves receipt lookup failures and does not submit another mutation", async () => {
    const fetch = respond({ errors: [{ code: "create_receipt_not_found" }] }, 404);

    await expect(recoverAdminStoreOrder(key)).rejects.toMatchObject({
      message: "create_receipt_not_found",
      status: 404,
    });
    expect(fetch).toHaveBeenCalledOnce();
  });
});

it("rejects a guest quote whose structured address belongs to a different draft", async () => {
  const request = { ...input, buyer_user_id: undefined, guest };
  respond({
    data: {
      ...quote,
      shipping_address: { ...guest, address: "Another address" },
      shipping_address_version: null,
    },
  });
  await expect(quoteAdminStoreOrder(request)).rejects.toThrow("invalid_response");
});
