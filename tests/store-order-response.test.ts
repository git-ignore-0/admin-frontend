import { afterEach, expect, it, vi } from "vitest";
import { api } from "@/lib/client-api";
import { getStoreOrder, mutateStoreOrder } from "@/lib/store-orders";
import { storeOrderFixture } from "./store-orders-fixture";

vi.mock("@/lib/client-api", () => ({ api: vi.fn() }));

const order = storeOrderFixture({ id: "01234567-abcd-4abc-8abc-0123456789ab" });
const other = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

afterEach(() => vi.mocked(api).mockReset());

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
])("rejects an invalid %s from a read or mutation", async (_, corrupt) => {
  vi.mocked(api).mockResolvedValue({ ...order, ...corrupt });
  await expect(getStoreOrder(order.id)).rejects.toThrow("invalid_response");
  await expect(mutateStoreOrder(order.id, "cancel", {})).rejects.toThrow("invalid_response");
});

it.each([1, 2] as const)(
  "accepts a workflow %i detail and its valid mutation response",
  async (workflow_version) => {
    const row = { ...order, workflow_version };
    vi.mocked(api).mockResolvedValue(row);
    expect(await getStoreOrder(row.id)).toBe(row);
    expect(await mutateStoreOrder(row.id, "cancel", {})).toBe(row);
  },
);
