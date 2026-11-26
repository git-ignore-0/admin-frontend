import { vi } from "vitest";

import type { api as clientApi } from "@/lib/client-api";
import type { StoreOrder } from "@/lib/types";

// UI fixtures queue explicit snapshots/errors on one transport spy. POSTs wrap
// that snapshot with the successful receipt for the submitted test intent.
export function createStoreOrderApiMock() {
  const api = vi.fn<(...args: Parameters<typeof clientApi>) => Promise<unknown>>();
  const apiEnvelope = async (...args: Parameters<typeof clientApi>) => {
    const [path, init] = args;
    const match = /^admin\/store-orders\/([^/]+)\/([^/]+)$/.exec(path);
    if (!match || init?.method !== "POST") throw new Error(`Unexpected request: ${path}`);
    const [, order_id, action] = match;
    const { idempotency_key } = JSON.parse(String(init.body));
    return {
      data: await api(...args),
      meta: { action_receipt: { order_id, action: action.replaceAll("-", "_"), idempotency_key } },
    };
  };
  return { api, apiEnvelope };
}

export function storeOrderFixture(overrides: Partial<StoreOrder> = {}): StoreOrder {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    reference_code: "NFV-STORE-001",
    workflow_version: 1,
    status: "pending_review",
    payment_status: "unconfirmed",
    refund_status: null,
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
    payment: {
      status: "unconfirmed",
      bank_bin: "970436",
      bank_name: "Vietcombank",
      account_number: "123456789",
      account_name: "NFV",
      transfer_content: "NFVSTORE001",
      qr_payload: {
        acqId: "970436",
        accountNo: "123456789",
        accountName: "NFV",
        amount: 105000,
        addInfo: "NFVSTORE001",
      },
      received_at: null,
      refunded_at: null,
      refund_amount_vnd: null,
      refund_note: "",
    },
    expires_at: "2026-10-31T10:08:00Z",
    server_time: "2026-10-31T10:00:00Z",
    transfer_reported_at: "2026-10-31T09:59:00Z",
    transfer_reported_by: null,
    payment_received_at: null,
    payment_received_by: null,
    refund_requested_at: null,
    refund_requested_by: null,
    refund_request_closed_at: null,
    refund_request_closed_by: null,
    refund_request_closed_reason: null,
    refunded_at: null,
    refunded_by: null,
    refund_amount_vnd: null,
    refund_note: "",
    approved_at: null,
    approved_by: null,
    delivered_at: null,
    delivered_by: null,
    cancelled_at: null,
    cancelled_by: null,
    cancellation_reason: null,
    reconciliation_note: "",
    created_at: "2026-10-31T09:55:00Z",
    updated_at: "2026-10-31T10:00:00Z",
    allocation_suggestion: [],
    source_inventory: {
      refresh_required_before_approve: true,
      product_reservations: [],
      candidates: [],
    },
    allocations: [],
    ...overrides,
  };
}
