import { describe, expect, it } from "vitest";

import {
  blankStoreOrderDraft,
  storeOrderDateRange,
  validateStoreOrderDraft,
  type StoreOrderDraft,
} from "@/lib/store-order-draft";

const product = {
  id: "11111111-1111-4111-8111-111111111111",
  status: "active" as const,
  retail_price_vnd: "45000",
};
const userId = "22222222-2222-4222-8222-222222222222";
const guest = {
  recipient_name: "  Nguyễn An  ",
  phone_number: "0901234567",
  province_code: "66",
  ward_code: "22015",
  address: " 12 Nguyễn Huệ ",
};

function draft(overrides: Partial<StoreOrderDraft> = {}): StoreOrderDraft {
  return {
    ...blankStoreOrderDraft(),
    deliveryDate: "01/01/2027",
    buyerType: "guest",
    guest,
    lines: [{ product, quantity: "2", unitPrice: "" }],
    ...overrides,
  };
}
const today = new Date("2026-12-31T17:00:00Z");

describe("create Store order draft", () => {
  it("keeps delivery dates as calendar dates across Vietnam midnight and years", () => {
    expect(storeOrderDateRange("new", new Date("2026-12-31T16:59:59Z"))).toEqual({
      min: "2026-12-31",
      max: "2027-01-07",
    });
    expect(storeOrderDateRange("new", today)).toEqual({ min: "2027-01-01", max: "2027-01-08" });
    expect(storeOrderDateRange("historical", today)).toEqual({ max: "2026-12-31" });
    expect(
      validateStoreOrderDraft(draft({ deliveryDate: "31/12/2026" }), "vi", today).input,
    ).toBeNull();
    expect(
      validateStoreOrderDraft(draft({ deliveryDate: "08/01/2027" }), "vi", today).input,
    ).toMatchObject({ delivery_date: "2027-01-08" });
    expect(
      validateStoreOrderDraft(draft({ deliveryDate: "09/01/2027" }), "vi", today).input,
    ).toBeNull();
    expect(
      validateStoreOrderDraft(draft({ deliveryDate: "31/02/2027" }), "vi", today).input,
    ).toBeNull();
  });

  it("sends one buyer and only fields permitted by the selected kind", () => {
    const created = validateStoreOrderDraft(draft(), "vi", today);
    expect(created.input).toEqual({
      kind: "new",
      delivery_date: "2027-01-01",
      locale: "vi",
      include_line_snapshot: true,
      guest: {
        ...guest,
        recipient_name: "Nguyễn An",
        phone_number: "+84901234567",
        address: "12 Nguyễn Huệ",
      },
      lines: [{ product_id: product.id, quantity: 2 }],
    });
    const historical = validateStoreOrderDraft(
      draft({
        kind: "historical",
        deliveryDate: "31/12/2026",
        buyerType: "user",
        userId,
        shippingFee: "7",
        lines: [{ product, quantity: "2", unitPrice: "34000" }],
      }),
      "en",
      today,
    );
    expect(historical.input).toEqual({
      kind: "historical",
      delivery_date: "2026-12-31",
      locale: "en",
      include_line_snapshot: true,
      buyer_user_id: userId,
      shipping_fee_vnd: "7",
      lines: [{ product_id: product.id, quantity: 2, unit_price_vnd: "34000" }],
    });
    expect(historical.total).toBe(68007n);
  });

  it.each([
    "+84901234567",
    "84901234567",
    "0901234567 ",
    "090123456x",
    "0612345678",
    "09012345678",
  ])("rejects a guest phone draft outside the domestic mobile format %j", (phone_number) => {
    const result = validateStoreOrderDraft(
      draft({ guest: { ...guest, phone_number } }),
      "vi",
      today,
    );
    expect(result.input).toBeNull();
    expect(result.errors.guest.phone_number).toBe("invalid");
  });

  it.each(["rejected", "composing"] as const)(
    "does not quote a previously valid guest number while its entry is %s",
    (guestPhoneEntry) => {
      const result = validateStoreOrderDraft(draft({ guestPhoneEntry }), "vi", today);
      expect(result.input).toBeNull();
      expect(result.errors.guest.phone_number).toBe("invalid");
    },
  );

  it("requires an explicit historical price and enforces exact totals", () => {
    const base = draft({ kind: "historical", deliveryDate: "31/12/2026", shippingFee: "1" });
    expect(
      validateStoreOrderDraft(base, "vi", today).errors.lines[product.id].unitPrice,
    ).toBeDefined();
    const edge = { product, quantity: "1", unitPrice: "9007199254740990" };
    expect(validateStoreOrderDraft({ ...base, lines: [edge] }, "vi", today).total).toBe(
      9007199254740991n,
    );
    expect(
      validateStoreOrderDraft(
        { ...base, lines: [{ ...edge, unitPrice: "9007199254740991" }] },
        "vi",
        today,
      ).errors.total,
    ).toBeDefined();
    expect(
      validateStoreOrderDraft({ ...base, lines: [{ ...edge, quantity: "1.0" }] }, "vi", today)
        .errors.lines[product.id].quantity,
    ).toBeDefined();
  });

  it("rejects duplicate product IDs without rewriting a selected line", () => {
    const line = { product, quantity: "2", unitPrice: "" };
    expect(
      validateStoreOrderDraft(draft({ lines: [line, line] }), "vi", today).errors.products,
    ).toBeDefined();
  });

  it("does not quote or total any pending rejected historical number", () => {
    const line = { product, quantity: "2", unitPrice: "34000" };
    const historical = draft({
      kind: "historical",
      deliveryDate: "31/12/2026",
      lines: [line],
      shippingFee: "7000",
    });
    for (const change of [
      { lines: [{ ...line, quantityRejected: true }] },
      { lines: [{ ...line, unitPriceRejected: true }] },
      { shippingFeeRejected: true },
      { lines: [{ ...line, quantity: "2\n" }] },
      { shippingFee: "7000\n" },
    ]) {
      const result = validateStoreOrderDraft({ ...historical, ...change }, "vi", today);
      expect(result.input).toBeNull();
      expect(result.total).toBeNull();
    }
    expect(validateStoreOrderDraft(historical, "vi", today).total).toBe(75000n);
  });
});
