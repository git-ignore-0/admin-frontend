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
  parseStoreQuantity,
  storeOrderStatusQuery,
  storeDeadlineRemainingMs,
  inspectStoreFarmDraft,
  reconcileStoreFarmDraft,
} from "@/lib/store-orders";
import {
  storeCancellationReason,
  storeOrderCountdown,
  storeShippingDiscountReason,
} from "@/lib/store-orders-copy";
import type { StoreOrder } from "@/lib/types";
import { sourceLineFixture, storeOrderFixture } from "@/tests/store-orders-fixture";

function order(overrides: Partial<StoreOrder> = {}) {
  return storeOrderFixture({ payment: null, ...overrides });
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
    expect(getStoreOrderActions(order())).toEqual(["approve", "cancel", "record-payment"]);
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
          refund_status: "pending",
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

  it("requires one eligible farm per current line and rejects foreign or missing drafts", () => {
    const base = order();
    const [first] = base.lines;
    const second = { ...first, id: "second", product_id: "other-product" };
    const farm = { farm_id: "a", farm_name: "Farm A", available_quantity: 3, eligible: true };
    const unavailable = { ...farm, farm_id: "b", eligible: false };
    const item = order({
      lines: [first, second],
      source_inventory: {
        refresh_required_before_approve: true,
        candidates: [],
        product_reservations: [],
        lines: [
          sourceLineFixture(first, [farm, unavailable], "a", "b"),
          sourceLineFixture(second, [farm], null),
        ],
      },
    });
    const initial = reconcileStoreFarmDraft(item);
    const incomplete = inspectStoreFarmDraft(item, initial);
    expect(incomplete.sources).toBeNull();
    expect(incomplete.selections.get(second.id)?.error).toBe("chooseFarm");
    const complete = new Map(initial).set(second.id, "a");
    expect(inspectStoreFarmDraft(item, complete).sources).toEqual([
      { line_id: first.id, farm_id: "a" },
      { line_id: second.id, farm_id: "a" },
    ]);
    expect(inspectStoreFarmDraft(item, new Map(complete).set("foreign", "a")).sources).toBeNull();
    expect(
      inspectStoreFarmDraft(item, new Map(complete).set(first.id, "b")).selections.get(first.id)
        ?.error,
    ).toBe("farmIneligible");
    expect(
      inspectStoreFarmDraft(item, new Map(complete).set(first.id, "invalid")).selections.get(
        first.id,
      )?.error,
    ).toBe("farmUnavailable");
  });

  it.each([
    [4453, "Còn 3 ngày 2 giờ 13 phút"],
    [1440, "Còn 1 ngày"],
    [1500, "Còn 1 ngày 1 giờ"],
    [125, "Còn 2 giờ 5 phút"],
    [60, "Còn 1 giờ"],
    [45, "Còn 45 phút"],
  ])("formats %i minutes", (minutes, label) => {
    expect(storeOrderCountdown(minutes * 60000, "vi")).toBe(label);
  });

  it("formats singular, plural, positive sub-minute, expired and missing deadlines", () => {
    expect(storeOrderCountdown(1501 * 60000, "en")).toBe("1 day 1 hour 1 minute remaining");
    expect(storeOrderCountdown(3002 * 60000, "en")).toBe("2 days 2 hours 2 minutes remaining");
    expect(storeOrderCountdown(59999, "vi")).toBe("Còn dưới 1 phút");
    expect(storeOrderCountdown(1, "en")).toBe("Less than 1 minute remaining");
    expect(storeOrderCountdown(0, "vi")).toBe("Đã hết thời hạn xử lý");
    expect(storeOrderCountdown(null, "en")).toBe("");
  });

  it.each([
    ["1", 1],
    ["0001", 1],
    ["0000001", null],
    ["999999", 999999],
    ["", null],
    ["0", null],
    ["1000000", null],
    ["-2", null],
    ["+2", null],
    ["1.5", null],
    ["1,000", null],
    ["1e3", null],
    ["abc", null],
    ["12abc", null],
    ["12 ", null],
    ["\t12", null],
    ["12\n", null],
    ["1\r2", null],
    ["１２", null],
    ["٩", null],
    ["12₫", null],
    ["12🌱", null],
    ["9007199254740992", null],
    ["9".repeat(600), null],
  ])("parses Store quantity %j before building an action payload", (raw, expected) => {
    expect(parseStoreQuantity(raw, 1)).toBe(expected);
  });

  it("accepts a configurable minimum and maximum for restock eligibility", () => {
    expect(parseStoreQuantity("0", 0, 0)).toBe(0);
    expect(parseStoreQuantity("1", 0, 0)).toBeNull();
    expect(parseStoreQuantity("3", 0, 3)).toBe(3);
    expect(parseStoreQuantity("4", 0, 3)).toBeNull();
    expect(parseStoreQuantity("1000000", 0, 2000000)).toBeNull();
  });

  it.each([0, 100, 101])("enforces the approval limit for %i lines", (lineCount) => {
    const item = order();
    const lines = Array.from({ length: lineCount }, (_, index) => ({
      ...item.lines[0],
      id: String(index),
    }));
    const farm = { farm_id: "a", farm_name: "Farm A", available_quantity: 3, eligible: true };
    const snapshot = order({
      lines,
      source_inventory: {
        refresh_required_before_approve: true,
        candidates: [],
        product_reservations: [],
        lines: lines.map((line) => sourceLineFixture(line, [farm], "a")),
      },
    });
    expect(inspectStoreFarmDraft(snapshot, reconcileStoreFarmDraft(snapshot)).sources?.length).toBe(
      lineCount === 100 ? 100 : undefined,
    );
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
    ["cancelled", "refund_required", "cancelled"],
    ["cancelled", "refunded", "cancelled"],
  ] as const)("shows %s / %s as one status: %s", (status, payment_status, expected) => {
    expect(getStoreOrderDisplayStatus(order({ status, payment_status }))).toBe(expected);
  });

  it("keeps verified-money filters separate from the six order states", () => {
    expect(buildStoreOrderQuery({ status: "cancelled", paymentStatus: "refund_required" })).toBe(
      "page=1&page_size=20&status=cancelled&payment_status=refund_required",
    );
    expect(buildStoreOrderQuery({ status: "cancelled", paymentStatus: "refunded" })).toBe(
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

describe("review-before-payment workflow contract", () => {
  it.each(["105000", "0"])("approves v2 goods without receipt for total %s", (total) => {
    expect(
      getStoreOrderActions(order({ workflow_version: 2, total_vnd: total, payment: null })),
    ).toEqual(["approve", "cancel"]);
  });
  it.each(["payment_pending", "payment_review"] as const)(
    "accepts receipt after goods in %s without requiring report",
    (status) => {
      expect(
        getStoreOrderActions(
          order({
            workflow_version: 2,
            status,
            approved_at: "2026-10-31T10:00:00Z",
            transfer_reported_at: null,
          }),
        ),
      ).toEqual(["cancel", "record-payment"]);
    },
  );
  it("keeps legacy combined approval without forcing a separate receipt first", () => {
    expect(getStoreOrderActions(order({ workflow_version: 1 }))).toEqual([
      "approve",
      "cancel",
      "record-payment",
    ]);
  });
  it("offers receipt and closing a claim, but no refund before money has been received", () => {
    expect(
      getStoreOrderActions(
        order({
          workflow_version: 2,
          status: "cancelled",
          approved_at: "2026-10-31T10:00:00Z",
          refund_status: "pending",
          payment_received_at: null,
        }),
      ),
    ).toEqual(["record-payment", "close-refund-request"]);
  });
  it.each([1, 2] as const)(
    "allows legacy late receipt but requires a pending reconciliation on v2 workflow %s",
    (workflow_version) => {
      const cancelled = order({ workflow_version, status: "cancelled", approved_at: null });
      expect(getStoreOrderActions(cancelled)).toEqual(
        workflow_version === 1 ? ["record-payment"] : [],
      );
      expect(getStoreOrderActions({ ...cancelled, approved_at: "2026-10-31T10:00:00Z" })).toEqual(
        workflow_version === 1 ? ["record-payment"] : [],
      );
    },
  );
  it("does not close a claim with recorded receipt and never refunds twice", () => {
    expect(
      getStoreOrderActions(
        order({
          workflow_version: 2,
          status: "cancelled",
          payment_status: "refund_required",
          refund_status: "pending",
          payment_received_at: "2026-10-31T10:01:00Z",
        }),
      ),
    ).toEqual(["refund"]);
    expect(
      getStoreOrderActions(
        order({
          workflow_version: 2,
          status: "cancelled",
          payment_status: "refunded",
          refund_status: "refunded",
        }),
      ),
    ).toEqual([]);
  });
  it("has no money actions for zero total or repeated payment on pending delivery", () => {
    expect(
      getStoreOrderActions(
        order({
          workflow_version: 2,
          status: "cancelled",
          total_vnd: "0",
          refund_status: "pending",
        }),
      ),
    ).toEqual([]);
    expect(
      getStoreOrderActions(
        order({ workflow_version: 2, status: "pending_delivery", payment_status: "unconfirmed" }),
      ),
    ).toEqual(["cancel", "deliver"]);
  });
  it("blocks deadline-sensitive order actions but preserves late receipt", () => {
    expect(getStoreOrderActions(order({ workflow_version: 2 }), { expired: true })).toEqual([]);
    expect(
      getStoreOrderActions(
        order({
          workflow_version: 2,
          status: "payment_pending",
          approved_at: "2026-10-31T10:00:00Z",
        }),
        { expired: true },
      ),
    ).toEqual(["record-payment"]);
  });
});

describe("v2 cancelled reconciliation is final", () => {
  it.each([null, "2026-10-31T09:59:00Z"])(
    "permits pending reconciliation regardless of buyer report %s",
    (transfer_reported_at) => {
      expect(
        getStoreOrderActions(
          order({
            workflow_version: 2,
            status: "cancelled",
            approved_at: "2026-10-31T10:00:00Z",
            refund_status: "pending",
            transfer_reported_at,
          }),
        ),
      ).toEqual(["record-payment", "close-refund-request"]);
    },
  );
  it.each([null, "pending"] as const)(
    "never opens money actions after no-money closure, including stale refund %s",
    (refund_status) => {
      expect(
        getStoreOrderActions(
          order({
            workflow_version: 2,
            status: "cancelled",
            approved_at: "2026-10-31T10:00:00Z",
            refund_status,
            refund_request_closed_at: "2026-10-31T10:02:00Z",
          }),
        ),
      ).toEqual([]);
    },
  );
});
