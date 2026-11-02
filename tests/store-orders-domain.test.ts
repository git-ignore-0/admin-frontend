import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { adminDictionaries } from "@/lib/admin-i18n";
import { adminNavigation } from "@/lib/admin-navigation";
import {
  IdempotencyKeyStore,
  buildStoreOrderQuery,
  formatStoreMoney,
  getStoreOrderActions,
  getStoreOrderPrimaryAction,
  getStoreOrderDisplayStatus,
  storeOrderStatusQuery,
  storeDeadlineRemainingMs,
  validateStoreAllocations,
} from "@/lib/store-orders";
import { storeCancellationReason, storeShippingDiscountReason } from "@/lib/store-orders-copy";
import type { StoreOrder, StoreOrderAllocationDraft } from "@/lib/types";

function order(overrides: Partial<StoreOrder> = {}): StoreOrder {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    reference_code: "NFV-STORE-001",
    status: "pending_review",
    payment_status: "unconfirmed",
    locale: "vi",
    lines: [
      {
        id: "22222222-2222-4222-8222-222222222222",
        product_id: "33333333-3333-4333-8333-333333333333",
        sku: "RAU-01",
        name: "Rau muống",
        unit_size: "0.5",
        unit_label: "kg",
        unit_price_vnd: "30000",
        quantity: 3,
        quota_group_id: null,
        quota_cost: null,
        quota_quantity: 0,
        quota_units: 0,
        cash_quantity: 3,
        cash_subtotal_vnd: "90000",
      },
    ],
    shipping_address: {
      recipient_name: "Nguyễn An",
      phone_number: "+84901234567",
      province_code: "79",
      ward_code: "26734",
      address: "1 Đường Vườn",
    },
    subtotal_vnd: "90000",
    shipping_fee_vnd: "15000",
    shipping_discount_reason: null,
    total_vnd: "105000",
    payment: null,
    expires_at: "2026-10-31T10:08:00Z",
    server_time: "2026-10-31T10:00:00Z",
    transfer_reported_at: "2026-10-31T09:59:00Z",
    approved_at: null,
    delivered_at: null,
    cancelled_at: null,
    cancellation_reason: null,
    reconciliation_note: "",
    created_at: "2026-10-31T09:55:00Z",
    updated_at: "2026-10-31T10:00:00Z",
    allocation_suggestion: [],
    source_inventory: {
      refresh_required_before_approve: true,
      product_reservations: [],
      candidates: [
        {
          line_id: "22222222-2222-4222-8222-222222222222",
          product_id: "33333333-3333-4333-8333-333333333333",
          farm_id: "44444444-4444-4444-8444-444444444444",
          farm_name: "Vườn A",
          batch_id: "55555555-5555-4555-8555-555555555555",
          start_date: "2026-10-30",
          end_date: "2026-11-02",
          available_quantity: 2,
        },
        {
          line_id: "22222222-2222-4222-8222-222222222222",
          product_id: "33333333-3333-4333-8333-333333333333",
          farm_id: "66666666-6666-4666-8666-666666666666",
          farm_name: "Vườn B",
          batch_id: "77777777-7777-4777-8777-777777777777",
          start_date: "2026-10-31",
          end_date: "2026-11-03",
          available_quantity: 2,
        },
      ],
    },
    allocations: [],
    ...overrides,
  };
}

describe("Store order admin domain", () => {
  it("adds Store orders to the Store navigation section in both locales", () => {
    for (const locale of ["vi", "en"] as const) {
      const store = adminNavigation(adminDictionaries[locale]).find(
        (section) => section.key === "store",
      );
      expect(store?.items.some((item) => item.href === "/store-orders")).toBe(true);
    }
  });

  it("builds only backend-supported list parameters", () => {
    expect(
      buildStoreOrderQuery({
        page: 3,
        search: " NFV-001 ",
        status: "pending_review",
        paymentStatus: "unconfirmed",
        sort: "deadline_asc",
      }),
    ).toBe(
      "page=3&page_size=20&search=NFV-001&status=pending_review&payment_status=unconfirmed&sort=deadline_asc",
    );
  });

  it("formats backend decimal strings without converting through Number", () => {
    expect(formatStoreMoney("9007199254740993", "vi")).toContain("9.007.199.254.740.993");
    expect(formatStoreMoney("0", "en")).toContain("0");
  });

  it("uses server time rather than the client clock for deadline remaining", () => {
    const receivedAt = Date.parse("2026-10-31T03:00:00Z");
    const clientNow = receivedAt + 60_000;
    expect(storeDeadlineRemainingMs(order(), receivedAt, clientNow)).toBe(7 * 60_000);
  });

  it("exposes only actions valid for the order and payment state", () => {
    expect(getStoreOrderActions(order())).toEqual(["cancel", "record-payment"]);
    expect(getStoreOrderActions(order({ payment_status: "received" }))).toEqual([
      "approve",
      "cancel",
    ]);
    expect(getStoreOrderActions(order({ total_vnd: "0", payment_status: "not_required" }))).toEqual(
      ["approve", "cancel"],
    );
    expect(
      getStoreOrderActions(
        order({
          status: "pending_delivery",
          payment_status: "received",
          approved_at: "2026-10-31T10:01:00Z",
        }),
      ),
    ).toEqual(["cancel", "deliver"]);
    expect(
      getStoreOrderActions(
        order({ status: "cancelled", payment_status: "unconfirmed", cancelled_at: "x" }),
      ),
    ).toEqual(["record-payment"]);
    expect(
      getStoreOrderActions(
        order({
          status: "cancelled",
          payment_status: "refund_required",
          approved_at: "x",
          allocations: [
            {
              id: "allocation-1",
              line_id: order().lines[0].id,
              product_id: order().lines[0].product_id,
              batch_id: "batch-1",
              farm_id: "farm-1",
              farm_name: "Vườn A",
              start_date: "2026-10-30",
              end_date: "2026-11-02",
              quantity: 3,
              restocked_quantity: 1,
              restock_remaining_quantity: 2,
              restock_eligible: true,
              restock_unavailable_reason: null,
            },
          ],
        }),
      ),
    ).toEqual(["refund", "restock"]);
    expect(
      getStoreOrderActions(order({ status: "delivered", payment_status: "received" })),
    ).toEqual([]);
  });

  it("chooses the primary action only from available actions", () => {
    expect(getStoreOrderPrimaryAction(getStoreOrderActions(order()))).toBe("record-payment");
    expect(
      getStoreOrderPrimaryAction(getStoreOrderActions(order({ payment_status: "received" }))),
    ).toBe("approve");
    expect(
      getStoreOrderPrimaryAction(
        getStoreOrderActions(order({ total_vnd: "0", payment_status: "not_required" })),
      ),
    ).toBe("approve");
    expect(getStoreOrderPrimaryAction(["cancel", "deliver"])).toBe("deliver");
    expect(getStoreOrderPrimaryAction(["refund", "restock"])).toBe("refund");
    expect(getStoreOrderPrimaryAction(["cancel"])).toBeNull();
    expect(getStoreOrderPrimaryAction(["restock"])).toBeNull();
    expect(getStoreOrderPrimaryAction([])).toBeNull();
  });

  it("validates complete unique allocations against each line and shared batch availability", () => {
    const valid: StoreOrderAllocationDraft[] = [
      {
        line_id: order().lines[0].id,
        batch_id: "55555555-5555-4555-8555-555555555555",
        quantity: 2,
      },
      {
        line_id: order().lines[0].id,
        batch_id: "77777777-7777-4777-8777-777777777777",
        quantity: 1,
      },
    ];
    expect(validateStoreAllocations(order(), valid)).toEqual({ valid: true, errors: [] });
    expect(validateStoreAllocations(order(), [...valid, valid[0]])).toEqual({
      valid: false,
      errors: ["duplicate"],
    });
    expect(validateStoreAllocations(order(), valid.slice(0, 1))).toEqual({
      valid: false,
      errors: ["line_incomplete"],
    });
    expect(
      validateStoreAllocations(order(), [
        { ...valid[0], quantity: 3 },
        { ...valid[1], quantity: 1 },
      ]),
    ).toEqual({ valid: false, errors: ["line_exceeded", "batch_exceeded"] });
  });

  it("keeps retry keys for an unchanged restock ledger and rotates only when the selected ledger changes", () => {
    let sequence = 0;
    const keys = new IdempotencyKeyStore(() => `key-${++sequence}`);
    const payload = { allocations: [{ allocation_id: "a", quantity: 1 }] };
    expect(keys.forPayload("restock", payload, { a: 0 })).toBe("key-1");
    expect(keys.forPayload("restock", payload, { a: 0 })).toBe("key-1");
    expect(keys.forPayload("restock", payload, { a: 1 })).toBe("key-2");
    expect(keys.forPayload("restock", payload, { a: 1 })).toBe("key-2");
  });

  it("reuses a key for the same action payload and rotates it after the payload changes", () => {
    let sequence = 0;
    const keys = new IdempotencyKeyStore(() => `key-${++sequence}`);
    expect(keys.forPayload("cancel", { reason: "out of stock" })).toBe("key-1");
    expect(keys.forPayload("cancel", { reason: "out of stock" })).toBe("key-1");
    expect(keys.forPayload("cancel", { reason: "payment missing" })).toBe("key-2");
    expect(keys.forPayload("deliver", {})).toBe("key-3");
  });

  it("localizes known backend reason codes without changing unknown or admin-entered text", () => {
    expect(storeShippingDiscountReason("active_csa_with_csa_product", "en")).toBe(
      "CSA member purchasing a CSA product",
    );
    expect(storeCancellationReason("buyer_cancelled", "vi")).toBe("Khách đã hủy đơn");
    expect(storeCancellationReason("Manual admin reason", "en")).toBe("Manual admin reason");
  });
});

describe("Store order unified status", () => {
  it.each([
    ["pending_review", "not_required", "pending_review"],
    ["pending_review", "received", "pending_review"],
    ["pending_delivery", "received", "pending_delivery"],
    ["cancelled", "unconfirmed", "cancelled"],
    ["cancelled", "refund_required", "refund_required"],
    ["cancelled", "refunded", "refunded"],
  ] as const)("shows %s / %s as one status: %s", (status, payment_status, expected) => {
    expect(getStoreOrderDisplayStatus(order({ status, payment_status }))).toBe(expected);
  });

  it("maps refund filters to cancelled orders and clears payment filtering for normal states", () => {
    expect(buildStoreOrderQuery(storeOrderStatusQuery("refund_required"))).toBe(
      "page=1&page_size=20&status=cancelled&payment_status=refund_required",
    );
    expect(buildStoreOrderQuery(storeOrderStatusQuery("refunded"))).toBe(
      "page=1&page_size=20&status=cancelled&payment_status=refunded",
    );
    expect(buildStoreOrderQuery(storeOrderStatusQuery("pending_review"))).toBe(
      "page=1&page_size=20&status=pending_review",
    );
    expect(buildStoreOrderQuery(storeOrderStatusQuery(""))).toBe("page=1&page_size=20");
  });
});

it.each(["__proto__", "constructor", "toString", "hasOwnProperty"])(
  "renders cancellation reason %s as literal text in both locales",
  (reason) => {
    for (const locale of ["vi", "en"] as const) {
      const label = storeCancellationReason(reason, locale);
      expect(label).toBe(reason);
      expect(renderToStaticMarkup(createElement("span", null, label))).toBe(
        `<span>${reason}</span>`,
      );
      expect(storeShippingDiscountReason(reason, locale)).toBe(reason);
    }
  },
);
