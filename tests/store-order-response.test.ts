import { afterEach, expect, it, vi } from "vitest";
import { api, apiEnvelope } from "@/lib/client-api";
import { getStoreOrder, mutateStoreOrder } from "@/lib/store-orders";
import { sourceLineFixture, storeOrderFixture } from "./store-orders-fixture";

vi.mock("@/lib/client-api", () => ({ api: vi.fn(), apiEnvelope: vi.fn() }));

const order = storeOrderFixture({ id: "01234567-abcd-4abc-8abc-0123456789ab" });
const other = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const cancelPayload = {
  idempotency_key: "00000000-0000-4000-8000-000000000001",
  reason: "Hết hàng",
};

function cancelResponse(data: unknown) {
  return {
    data,
    meta: {
      action_receipt: {
        order_id: order.id,
        action: "cancel",
        idempotency_key: cancelPayload.idempotency_key,
      },
    },
  };
}

afterEach(() => {
  vi.mocked(api).mockReset();
  vi.mocked(apiEnvelope).mockReset();
});

it("normalizes the requested order UUID and verifies the response against it", async () => {
  vi.mocked(api).mockResolvedValueOnce({ ...order, id: order.id.toUpperCase() });
  expect((await getStoreOrder(order.id.toUpperCase())).id.toLowerCase()).toBe(order.id);
  expect(vi.mocked(api).mock.calls[0][0]).toBe(`admin/store-orders/${order.id}`);
  vi.mocked(api).mockResolvedValueOnce({ ...order, id: other });
  await expect(getStoreOrder(order.id)).rejects.toThrow("invalid_response");
});

it.each([
  ["order identity", { id: other }],
  ["workflow", { workflow_version: 5 }],
  ["server clock", { server_time: "invalid" }],
  ["payment state", { payment_status: "invalid" }],
  ["refund state", { refund_status: "invalid" }],
  ["customer address", { shipping_address: { ...order.shipping_address, address: null } }],
  ["line", { lines: [{ ...order.lines[0], quantity: "3" }] }],
  ["allocation", { allocations: [{ id: "bad" }] }],
  ["suggestion", { allocation_suggestion: [{ line_id: other, batch_id: other, quantity: 1 }] }],
  ["inventory", { source_inventory: { ...order.source_inventory, candidates: [null] } }],
  ["omitted admin inventory", { source_inventory: undefined }],
  ["CSA", { csa: { round: {}, selection: {} } }],
])(
  "rejects an invalid %s while recognizing a separately valid write receipt",
  async (_, corrupt) => {
    const data = { ...order, ...corrupt };
    vi.mocked(api).mockResolvedValue(data);
    vi.mocked(apiEnvelope).mockResolvedValue(cancelResponse(data));
    await expect(getStoreOrder(order.id)).rejects.toThrow("invalid_response");
    await expect(mutateStoreOrder(order.id, "cancel", cancelPayload)).resolves.toBeNull();
  },
);

it("does not recognize a write with the wrong receipt key", async () => {
  const response = cancelResponse(order);
  response.meta.action_receipt.idempotency_key = other;
  vi.mocked(apiEnvelope).mockResolvedValue(response);
  await expect(mutateStoreOrder(order.id, "cancel", cancelPayload)).rejects.toThrow(
    "invalid_response",
  );
});

it.each([1, 2] as const)(
  "accepts a workflow %i detail and its valid mutation response",
  async (workflow_version) => {
    const row = { ...order, workflow_version };
    const cancelled = { ...row, status: "cancelled", cancelled_at: "2026-10-31T10:01:00Z" };
    vi.mocked(api).mockResolvedValue(row);
    vi.mocked(apiEnvelope).mockResolvedValue(cancelResponse(cancelled));
    expect(await getStoreOrder(row.id)).toBe(row);
    expect(await mutateStoreOrder(row.id, "cancel", cancelPayload)).toBe(cancelled);
  },
);

const farmId = "00000000-0000-4000-8000-000000000037";
const farm = { farm_id: farmId, farm_name: "Farm A", available_quantity: 3, eligible: true };
const source = sourceLineFixture(order.lines[0], [farm], farmId, other);

it.each([
  ["missing", undefined],
  ["non-array", {}],
  ["missing line", []],
  ["duplicate line", [source, source]],
  ["foreign line", [{ ...source, line_id: other }]],
  ["invalid line UUID", [{ ...source, line_id: "bad" }]],
  ["mismatched product", [{ ...source, product_id: other }]],
  ["mismatched quantity", [{ ...source, required_quantity: 2 }]],
  ["unsafe quantity", [{ ...source, required_quantity: Number.MAX_SAFE_INTEGER + 1 }]],
  ["invalid assignment", [{ ...source, assigned_farm_id: 1 }]],
  ["invalid suggestion", [{ ...source, suggested_farm_id: "bad" }]],
  ["missing suggested farm", [{ ...source, suggested_farm_id: other }]],
  ["non-array farms", [{ ...source, farms: null }]],
  ["duplicate farm", [{ ...source, farms: [farm, farm] }]],
  ["invalid farm UUID", [{ ...source, farms: [{ ...farm, farm_id: 1 }] }]],
  ["invalid farm name", [{ ...source, farms: [{ ...farm, farm_name: 42 }] }]],
  ["invalid capability", [{ ...source, farms: [{ ...farm, eligible: "true" }] }]],
  ["invalid capacity", [{ ...source, farms: [{ ...farm, available_quantity: -1 }] }]],
  ["fractional capacity", [{ ...source, farms: [{ ...farm, available_quantity: 3.5 }] }]],
  [
    "unsafe capacity",
    [{ ...source, farms: [{ ...farm, available_quantity: Number.MAX_SAFE_INTEGER + 1 }] }],
  ],
  ["eligible without capacity", [{ ...source, farms: [{ ...farm, available_quantity: 2 }] }]],
  ["ineligible suggestion", [{ ...source, farms: [{ ...farm, eligible: false }] }]],
])("rejects new inventory with %s and still recognizes a valid receipt", async (_, lines) => {
  const data = { ...order, source_inventory: { ...order.source_inventory, lines } };
  vi.mocked(api).mockResolvedValueOnce(data);
  vi.mocked(apiEnvelope).mockResolvedValueOnce(cancelResponse(data));
  await expect(getStoreOrder(order.id)).rejects.toThrow("invalid_response");
  await expect(mutateStoreOrder(order.id, "cancel", cancelPayload)).resolves.toBeNull();
});

it.each([3_000_000_000, Number.MAX_SAFE_INTEGER])(
  "accepts a consistent Farm projection with aggregate stock %i",
  async (available_quantity) => {
    const [line] = order.lines;
    const data = {
      ...order,
      source_inventory: {
        ...order.source_inventory,
        lines: [{ ...source, farms: [{ ...farm, available_quantity }] }],
        product_reservations: [
          {
            product_id: line.product_id,
            reserved_quantity: available_quantity,
            this_order_quantity: line.quantity,
            other_orders_quantity: available_quantity - line.quantity,
          },
        ],
      },
    };
    vi.mocked(api).mockResolvedValueOnce(data);
    await expect(getStoreOrder(order.id)).resolves.toBe(data);
  },
);

it("accepts an assigned Farm absent from the options, same-name Farms, and empty options", async () => {
  const second = { ...order.lines[0], id: "00000000-0000-4000-8000-000000000038" };
  const data = {
    ...order,
    lines: [...order.lines, second],
    source_inventory: {
      ...order.source_inventory,
      lines: [
        { ...source, farms: [farm, { ...farm, farm_id: second.id, eligible: false }] },
        sourceLineFixture(second),
      ],
    },
  };
  vi.mocked(api).mockResolvedValueOnce(data);
  await expect(getStoreOrder(order.id)).resolves.toBe(data);
  vi.mocked(api).mockResolvedValueOnce({ ...data, lines: [data.lines[0], data.lines[0]] });
  await expect(getStoreOrder(order.id)).rejects.toThrow("invalid_response");
});
