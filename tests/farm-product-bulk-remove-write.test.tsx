import { act, cleanup, render, renderHook, waitFor } from "@testing-library/react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { createRef } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { AdminQueryProvider } from "@/components/admin-query-provider";
import { useFarmDeletion } from "@/components/use-farm-deletion";
import {
  confirmFarmGone,
  farmAccess,
  farmDeleteSupplyWriteFilters,
  farmDetailKey,
  farmSupplyKey,
  farmSupplyWriteKey,
  retireFarmAccess,
} from "@/lib/farm-query";
import type { AdminSupplyRequest } from "@/lib/farm-supply-request-api";
import type { FarmProduct, FarmProductDetail, FarmStockBatch } from "@/lib/types";
import { useFarmBulkWrite } from "@/lib/use-farm-bulk-write";
import { useFarmProductLinkWrite } from "@/lib/use-farm-product-link-write";
import { useFarmSourceWrite } from "@/lib/use-farm-source-write";
import { useFarmProductBulkRemove } from "@/lib/use-farm-product-bulk-remove";

const api = vi.hoisted(() => ({
  removeFarmProductsBulk: vi.fn(),
  recoverFarmProductBulkRemove: vi.fn(),
  linkFarmProducts: vi.fn(),
  readdFarmProduct: vi.fn(),
  removeFarmProduct: vi.fn(),
  updateFarmStockBatch: vi.fn(),
  cancelFarmStockBatch: vi.fn(),
  postFarmBulkSupply: vi.fn(),
  deleteFarm: vi.fn(),
}));
vi.mock("@/lib/farms-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/farms-api")>()),
  ...api,
}));

const farmId = "bc2e9161-9975-4f40-92dd-6a390fb604f6";
const otherFarm = "16571f6c-f84c-46ba-92bf-2402b8663ce9";
const productId = "a443e31d-4b92-4c60-8f67-16caa7b0e4c4";
const sourceId = "af0404e9-e492-47c7-a281-8348407cf1c3";
const source = {
  id: sourceId,
  farm_id: farmId,
  product_id: productId,
  supply_status: "supplying",
  version: 3,
} as FarmProduct;

function apiError(code: string, status: number, context?: unknown) {
  return Object.assign(new Error(code), { status, payload: { errors: [{ code, context }] } });
}

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it("keeps an unknown intent locked through a receipt miss and retries the original snapshot", async () => {
  const first = { ...source };
  const confirmed = vi.fn();
  const { result } = renderHook(
    () => ({ writer: useFarmProductBulkRemove(farmId), client: useQueryClient() }),
    { wrapper: AdminQueryProvider },
  );
  api.removeFarmProductsBulk.mockRejectedValueOnce(new Error("network_error"));
  api.recoverFarmProductBulkRemove.mockRejectedValueOnce(apiError("create_receipt_not_found", 404));

  act(() => {
    void result.current.writer.submit([first], confirmed);
    void result.current.writer.submit([first], confirmed);
    first.version = 19;
  });
  await waitFor(() => expect(result.current.writer.failure?.kind).toBe("unknown"));
  expect(api.removeFarmProductsBulk).toHaveBeenCalledTimes(1);
  const sent = api.removeFarmProductsBulk.mock.calls[0][1];
  expect(sent.items).toEqual([
    { product_id: productId, expected_link_id: sourceId, expected_version: 3 },
  ]);
  expect(
    result.current.client.getMutationCache().find(farmDeleteSupplyWriteFilters(farmId)),
  ).toBeDefined();
  expect(
    result.current.client.getMutationCache().find(farmDeleteSupplyWriteFilters(otherFarm)),
  ).toBeUndefined();

  await act(async () => result.current.writer.recover(confirmed));
  await waitFor(() => expect(result.current.writer.failure?.receiptNotFound).toBe(true));
  act(() => {
    result.current.writer.clearFailure();
    void result.current.writer.submit([first], confirmed);
  });
  expect(api.removeFarmProductsBulk).toHaveBeenCalledTimes(1);
  expect(confirmed).not.toHaveBeenCalled();

  api.recoverFarmProductBulkRemove.mockRejectedValueOnce(apiError("idempotency_conflict", 409));
  await act(async () => result.current.writer.recover(confirmed));
  await waitFor(() =>
    expect(result.current.writer.failure?.cause).toMatchObject({ message: "idempotency_conflict" }),
  );
  expect(result.current.writer.unresolved).toBe(true);

  api.removeFarmProductsBulk.mockResolvedValueOnce({ removed_count: 1 });
  await act(async () => result.current.writer.retry(confirmed));
  expect(api.removeFarmProductsBulk.mock.calls[1]).toEqual([farmId, sent]);
  expect(api.removeFarmProductsBulk.mock.calls[1][1]).toBe(sent);
  expect(confirmed).toHaveBeenCalledExactlyOnceWith(1);
});

it("refreshes only related query scopes after receipt confirmation without forcing row removal", async () => {
  const { result } = renderHook(
    () => ({ writer: useFarmProductBulkRemove(farmId), client: useQueryClient() }),
    { wrapper: AdminQueryProvider },
  );
  const { client } = result.current;
  const scope = farmSupplyKey(farmId);
  const invalidated = [
    [...scope, "list"],
    [...scope, "available"],
    [...scope, "eligible"],
    [...scope, "source", productId],
    [...scope, "batches", productId],
    [...scope, "history", productId],
    ["farms", "list"],
    ["farms", "detail", farmId],
  ];
  const unaffected = [
    [...scope, "source", "unaffected"],
    [...farmSupplyKey(otherFarm), "list"],
  ];
  const relinked = { ...source, version: 10, supply_generation: 2 };
  for (const key of [...invalidated, ...unaffected]) client.setQueryData(key, relinked);
  api.removeFarmProductsBulk.mockRejectedValueOnce(apiError("upstream_timeout", 504));
  api.recoverFarmProductBulkRemove.mockResolvedValueOnce({ removed_count: 1 });
  const confirmed = vi.fn();
  await act(async () => result.current.writer.submit([source], confirmed));
  await waitFor(() => expect(result.current.writer.failure?.kind).toBe("unknown"));
  expect(invalidated.every((key) => !client.getQueryState(key)?.isInvalidated)).toBe(true);

  await act(async () => result.current.writer.recover(confirmed));
  expect(api.removeFarmProductsBulk).toHaveBeenCalledTimes(1);
  expect(api.recoverFarmProductBulkRemove).toHaveBeenCalledExactlyOnceWith(
    farmId,
    api.removeFarmProductsBulk.mock.calls[0][1],
  );
  expect(confirmed).toHaveBeenCalledExactlyOnceWith(1);
  for (const key of invalidated)
    expect(client.getQueryState(key)?.isInvalidated, key.join("/")).toBe(true);
  for (const key of unaffected)
    expect(client.getQueryState(key)?.isInvalidated, key.join("/")).toBe(false);
  expect(client.getQueryData([...scope, "list"])).toBe(relinked);
});

it("blocks overlapping writers and survives route remounts within the same session", async () => {
  let client!: QueryClient;
  let writer!: ReturnType<typeof useFarmProductBulkRemove>;
  let finish!: (cause: unknown) => void;
  let operation: Promise<void> | undefined;
  const confirmed = vi.fn();
  api.removeFarmProductsBulk.mockImplementationOnce(
    () => new Promise((_, reject) => (finish = reject)),
  );
  function List() {
    client = useQueryClient();
    writer = useFarmProductBulkRemove(farmId);
    return null;
  }
  const route = (screen: "list" | "related" | "other") => (
    <AdminQueryProvider>
      {screen === "list" && <List />}
      {screen === "related" && <Related />}
    </AdminQueryProvider>
  );
  let checkOtherWriters!: () => void;
  let disabled!: boolean;
  function Related() {
    const link = useFarmProductLinkWrite(farmId, undefined);
    const readd = useFarmProductLinkWrite(farmId, productId);
    const sourceWrite = useFarmSourceWrite(farmId, productId);
    const bulk = useFarmBulkWrite(farmId);
    const deletion = useFarmDeletion(farmId);
    disabled = link.blocked && readd.blocked && sourceWrite.isWriting && bulk.blocked;
    checkOtherWriters = () => {
      const batch = {} as FarmStockBatch;
      const detail = source as FarmProductDetail;
      const filter = { scope: "current" as const, page: 1 };
      expect(
        link.submit(
          {
            kind: "link",
            products: [
              {
                id: productId,
                sku: "FARM-01",
                name_vi: "Rau",
                name_en: "Greens",
                unit_size: "1",
                unit_label_vi: "kg",
                unit_label_en: "kg",
                link_state: "unlinked",
                removed_source: null,
              },
            ],
          },
          confirmed,
        ),
      ).toBeUndefined();
      expect(readd.submit({ kind: "readd", source }, confirmed)).toBeUndefined();
      void sourceWrite.submit({ kind: "remove", source: detail }, filter, confirmed);
      void sourceWrite.submit({ kind: "edit", source: detail, batch }, filter, confirmed, {
        start_date: "2026-12-01",
        end_date: "2026-12-31",
        quantity_units: 2,
      });
      void sourceWrite.submit({ kind: "cancel", source: detail, batch }, filter, confirmed);
      expect(
        bulk.submit(
          {
            start_date: "2026-12-01",
            end_date: "2026-12-31",
            items: [
              {
                product_id: productId,
                expected_link_id: sourceId,
                expected_version: 3,
                quantity_units: 2,
              },
            ],
          },
          confirmed,
        ),
      ).toBeUndefined();
      expect(deletion.run("delete")).toBeUndefined();
    };
    return null;
  }

  const { rerender } = render(route("list"));
  client.setQueryData(farmDetailKey(farmId), {
    id: farmId,
    capabilities: { delete: { allowed: true, reasons: [] } },
  });
  act(() => {
    operation = writer.submit([source], confirmed);
  });
  await waitFor(() => expect(writer.pending).toBe(true));
  rerender(route("related"));
  await waitFor(() => expect(disabled).toBe(true));
  act(checkOtherWriters);
  await act(async () => {
    finish(apiError("invalid_response", 200));
    await operation;
  });
  await waitFor(() => expect(disabled).toBe(true));
  act(checkOtherWriters);

  for (const call of [
    api.linkFarmProducts,
    api.readdFarmProduct,
    api.removeFarmProduct,
    api.updateFarmStockBatch,
    api.cancelFarmStockBatch,
    api.postFarmBulkSupply,
    api.deleteFarm,
  ]) {
    expect(call).not.toHaveBeenCalled();
  }
  expect(client.getMutationCache().find(farmDeleteSupplyWriteFilters(farmId))).toBeDefined();
  rerender(route("list"));
  await waitFor(() => expect(writer.failure?.kind).toBe("unknown"));
  expect(writer.intent?.products).toEqual([source]);
  expect(api.recoverFarmProductBulkRemove).not.toHaveBeenCalled();
  expect(api.removeFarmProductsBulk).toHaveBeenCalledTimes(1);
});

it("cannot start while a conflicting stock batch write has an unknown outcome", async () => {
  const { result } = renderHook(
    () => ({ writer: useFarmProductBulkRemove(farmId), client: useQueryClient() }),
    { wrapper: AdminQueryProvider },
  );
  const { client } = result.current;
  const entry = client.getMutationCache().build(client, {
    mutationKey: [...farmSupplyWriteKey(farmId), "source", productId],
    mutationFn: async () => {
      throw new Error("network_error");
    },
  });
  await act(async () => {
    await expect(entry.execute({ action: { kind: "edit" } })).rejects.toThrow("network_error");
  });
  await waitFor(() => expect(result.current.writer.blocked).toBe(true));
  expect(result.current.writer.submit([source], vi.fn())).toBeUndefined();
  expect(api.removeFarmProductsBulk).not.toHaveBeenCalled();
});

it.each(["farm_product_version_conflict", "farm_product_identity_changed"])(
  "matches %s only to the immutable submitted product",
  async (code) => {
    const { result } = renderHook(() => useFarmProductBulkRemove(farmId), {
      wrapper: AdminQueryProvider,
    });
    const confirmed = vi.fn();
    api.removeFarmProductsBulk.mockRejectedValueOnce(
      apiError(code, 409, { item_index: 4, product_id: productId }),
    );
    await act(async () => result.current.submit([source], confirmed));
    await waitFor(() =>
      expect(result.current.failure).toMatchObject({ kind: "conflict", item: undefined }),
    );
    expect(confirmed).not.toHaveBeenCalled();

    api.removeFarmProductsBulk.mockRejectedValueOnce(new Error("network_error"));
    api.removeFarmProductsBulk.mockRejectedValueOnce(
      apiError(code, 409, { item_index: 0, product_id: productId }),
    );
    await act(async () => {
      result.current.clearFailure();
      await result.current.submit([source], confirmed);
    });
    await waitFor(() => expect(result.current.failure?.kind).toBe("unknown"));
    await act(async () => result.current.retry(confirmed));
    await waitFor(() => expect(result.current.failure?.item).toMatchObject({ productId, code }));
    expect(result.current.unresolved).toBe(false);
    expect(confirmed).not.toHaveBeenCalled();
  },
);

it("stops at an idempotency conflict and requires a new explicit selection", async () => {
  const { result } = renderHook(() => useFarmProductBulkRemove(farmId), {
    wrapper: AdminQueryProvider,
  });
  const confirmed = vi.fn();
  api.removeFarmProductsBulk.mockRejectedValueOnce(apiError("idempotency_conflict", 409));
  await act(async () => result.current.submit([source], confirmed));
  await waitFor(() => expect(result.current.failure?.kind).toBe("idempotency_conflict"));
  expect(result.current.retry(confirmed)).toBeUndefined();
  expect(result.current.submit([source], confirmed)).toBeUndefined();
  expect(api.removeFarmProductsBulk).toHaveBeenCalledTimes(1);
  expect(confirmed).not.toHaveBeenCalled();
});

it.each([
  ["POST", 401],
  ["POST", 403],
  ["receipt", 401],
  ["receipt", 403],
] as const)("retires protected data on %s %s", async (request, status) => {
  const onAccessLost = vi.fn();
  const { result } = renderHook(
    () => ({ writer: useFarmProductBulkRemove(farmId, onAccessLost), client: useQueryClient() }),
    { wrapper: AdminQueryProvider },
  );
  const { client } = result.current;
  const key = [...farmSupplyKey(farmId), "list"];
  const cause = apiError(status === 403 ? "forbidden" : "auth_required", status);
  const confirmed = vi.fn();
  client.setQueryData(key, [source]);
  if (request === "receipt") {
    api.removeFarmProductsBulk.mockRejectedValueOnce(new Error("network_error"));
    api.recoverFarmProductBulkRemove.mockRejectedValueOnce(cause);
  } else api.removeFarmProductsBulk.mockRejectedValueOnce(cause);

  await act(async () => result.current.writer.submit([source], confirmed));
  if (request === "receipt") {
    await waitFor(() => expect(result.current.writer.unresolved).toBe(true));
    await act(async () => result.current.writer.recover(confirmed));
  }
  await waitFor(() => expect(result.current.writer.intent).toBeUndefined());
  expect(farmAccess(client).error).toBe(cause);
  expect(client.getQueryData(key)).toBeUndefined();
  expect(client.getMutationCache().find(farmDeleteSupplyWriteFilters(farmId))).toBeUndefined();
  expect(onAccessLost).toHaveBeenCalledExactlyOnceWith(cause);
  expect(confirmed).not.toHaveBeenCalled();
});

it.each(["session", "permission", "deleted"] as const)(
  "drops a late response after %s retirement",
  async (retirement) => {
    const retire = createRef<() => void>();
    const confirmed = vi.fn();
    const forbidden = apiError("forbidden", 403);
    let finish!: () => void;
    api.removeFarmProductsBulk.mockImplementationOnce(
      () =>
        new Promise((resolve, reject) => {
          finish = () =>
            retirement === "permission"
              ? reject(new Error("network_error"))
              : resolve({ removed_count: 1 });
        }),
    );
    const { result } = renderHook(
      () => ({ writer: useFarmProductBulkRemove(farmId), client: useQueryClient() }),
      {
        wrapper: ({ children }) => <AdminQueryProvider ref={retire}>{children}</AdminQueryProvider>,
      },
    );
    const { client } = result.current;
    const key = [...farmSupplyKey(farmId), "list"];
    client.setQueryData(key, [source]);
    let operation: Promise<void> | undefined;
    act(() => {
      operation = result.current.writer.submit([source], confirmed);
    });
    await waitFor(() => expect(finish).toBeTypeOf("function"));
    act(() => {
      if (retirement === "session") retire.current?.();
      else if (retirement === "permission") retireFarmAccess(client, forbidden);
      else confirmFarmGone(client, farmId);
    });
    await act(async () => {
      finish();
      await operation;
    });
    expect(client.getQueryData(key)).toBeUndefined();
    expect(client.getMutationCache().find(farmDeleteSupplyWriteFilters(farmId))).toBeUndefined();
    expect(confirmed).not.toHaveBeenCalled();
  },
);

it("allows only one same-Farm submission across two mounted instances", async () => {
  const confirmed = vi.fn();
  const duplicate = vi.fn();
  const { result, rerender } = renderHook(
    ({ compareFarm }) =>
      [useFarmProductBulkRemove(farmId), useFarmProductBulkRemove(compareFarm)] as const,
    { wrapper: AdminQueryProvider, initialProps: { compareFarm: farmId } },
  );
  api.removeFarmProductsBulk.mockRejectedValueOnce(new Error("network_error"));
  await act(async () => {
    const first = result.current[0].submit([source], confirmed);
    expect(result.current[1].submit([source], duplicate)).toBeUndefined();
    await first;
  });
  await waitFor(() => expect(result.current[1].unresolved).toBe(true));
  rerender({ compareFarm: otherFarm });
  expect(result.current[1].intent).toBeUndefined();
  expect(result.current[1].unresolved).toBe(false);
  expect(result.current[1].recover(duplicate)).toBeUndefined();
  expect(result.current[0].intent?.products).toEqual([source]);
  expect(api.removeFarmProductsBulk).toHaveBeenCalledTimes(1);
  expect(duplicate).not.toHaveBeenCalled();
});

it("updates affected data on a late same-session confirmation without calling the abandoned screen", async () => {
  let client!: QueryClient;
  let writer!: ReturnType<typeof useFarmProductBulkRemove>;
  let finish!: (value: { removed_count: number }) => void;
  let operation: Promise<void> | undefined;
  const confirmed = vi.fn();
  api.removeFarmProductsBulk.mockImplementationOnce(
    () => new Promise((resolve) => (finish = resolve)),
  );
  function List() {
    client = useQueryClient();
    writer = useFarmProductBulkRemove(farmId);
    return null;
  }
  const route = (show: boolean) => <AdminQueryProvider>{show && <List />}</AdminQueryProvider>;
  const { rerender } = render(route(true));
  const key = [...farmSupplyKey(farmId), "list"];
  client.setQueryData(key, [source]);
  act(() => {
    operation = writer.submit([source], confirmed);
  });
  await waitFor(() => expect(writer.pending).toBe(true));
  rerender(route(false));
  await act(async () => {
    finish({ removed_count: 1 });
    await operation;
  });
  expect(confirmed).not.toHaveBeenCalled();
  expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  expect(client.getMutationCache().find(farmDeleteSupplyWriteFilters(farmId))).toBeUndefined();
});

it("holds a Farm's approval and rejection until bulk removal is resolved", async () => {
  const { useFarmSupplyDecision } = await import("@/lib/use-farm-supply-decision");
  const { farmSupplyRequestDetailKey } = await import("@/lib/farm-query");
  const requestId = crypto.randomUUID();
  const request = { id: requestId, farm: { id: farmId }, status: "pending" } as AdminSupplyRequest;
  const { result } = renderHook(
    () => ({
      writer: useFarmProductBulkRemove(farmId),
      client: useQueryClient(),
      decision: useFarmSupplyDecision(requestId, request),
    }),
    { wrapper: AdminQueryProvider },
  );
  const { client } = result.current;
  client.setQueryData(farmSupplyRequestDetailKey(requestId), request);
  api.removeFarmProductsBulk.mockRejectedValueOnce(new Error("network_error"));
  await act(async () => result.current.writer.submit([source], vi.fn()));
  await waitFor(() => expect(result.current.writer.unresolved).toBe(true));
  await act(async () => {
    await result.current.decision.run("approve");
    await result.current.decision.run("reject", "Test");
  });
  expect(result.current.decision.intent).toBeUndefined();
  expect(client.getQueryData(farmSupplyRequestDetailKey(requestId))).toBe(request);
  expect(result.current.decision.report).toBeUndefined();
});
