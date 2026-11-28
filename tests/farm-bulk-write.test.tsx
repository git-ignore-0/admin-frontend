import { act, cleanup, render, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, useQueryClient } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { AdminQueryProvider } from "@/components/admin-query-provider";
import { farmAccess, farmDeleteSupplyWriteFilters, farmSupplyWriteKey } from "@/lib/farm-query";

const api = vi.hoisted(() => ({ postFarmBulkSupply: vi.fn(), recoverFarmBulkSupply: vi.fn() }));
vi.mock("@/lib/farms-api", () => api);

const farmId = "bc2e9161-9975-4f40-92dd-6a390fb604f6";
const productId = "a443e31d-4b92-4c60-8f67-16caa7b0e4c4";
const input = {
  start_date: "2026-12-01",
  end_date: "2026-12-31",
  items: [
    {
      product_id: productId,
      expected_link_id: "af0404e9-e492-47c7-a281-8348407cf1c3",
      expected_version: 3,
      quantity_units: 4,
    },
  ],
};

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it("blocks farm deletion while a bulk transaction has no confirmed outcome", async () => {
  const client = new QueryClient();
  const entry = client.getMutationCache().build(client, {
    mutationKey: [...farmSupplyWriteKey(farmId), "bulk"],
    mutationFn: async () => ({ failure: { kind: "unknown" } }),
  });
  await entry.execute(undefined);

  expect(client.getMutationCache().find(farmDeleteSupplyWriteFilters(farmId))).toBe(entry);
  expect(
    client.getMutationCache().find(farmDeleteSupplyWriteFilters("another-farm")),
  ).toBeUndefined();
  client.clear();
});

it("retries an unknown transaction with its immutable original input after a receipt miss", async () => {
  const { useFarmBulkWrite } = await import("@/lib/use-farm-bulk-write");
  const recovered = vi.fn();
  const { result } = renderHook(() => useFarmBulkWrite(farmId), { wrapper: AdminQueryProvider });
  const mutableInput = structuredClone(input);
  api.postFarmBulkSupply.mockRejectedValueOnce(new Error("network_error"));
  api.recoverFarmBulkSupply.mockRejectedValueOnce(
    Object.assign(new Error("create_receipt_not_found"), { status: 404 }),
  );

  act(() => {
    void result.current.submit(mutableInput, recovered);
    void result.current.submit(mutableInput, recovered);
    mutableInput.items[0].quantity_units = 19;
  });
  await waitFor(() => expect(result.current.failure?.kind).toBe("unknown"));
  expect(api.postFarmBulkSupply).toHaveBeenCalledTimes(1);
  expect(api.postFarmBulkSupply.mock.calls[0][1]).toMatchObject(input);
  await act(async () => result.current.recover(recovered));
  await waitFor(() => expect(result.current.failure?.receiptNotFound).toBe(true));
  expect(recovered).not.toHaveBeenCalled();

  api.postFarmBulkSupply.mockResolvedValueOnce({
    farm_id: farmId,
    created_count: 1,
    idempotent_replay: true,
  });
  await act(async () => result.current.retry(recovered));

  const firstIntent = api.postFarmBulkSupply.mock.calls[0][1];
  expect(api.postFarmBulkSupply.mock.calls[1]).toEqual([farmId, firstIntent]);
  expect(recovered).toHaveBeenCalledWith(firstIntent);
  await waitFor(() => expect(result.current.locked).toBe(false));
});

it("invalidates the affected source when a confirmed receipt arrives after unmount", async () => {
  const { useFarmBulkWrite } = await import("@/lib/use-farm-bulk-write");
  const success = vi.fn();
  let client!: QueryClient;
  let writer!: ReturnType<typeof useFarmBulkWrite>;
  let finish!: (value: unknown) => void;
  let operation: Promise<void> | undefined;
  api.postFarmBulkSupply.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
  function Writer() {
    client = useQueryClient();
    writer = useFarmBulkWrite(farmId);
    return null;
  }
  const route = (show: boolean) => <AdminQueryProvider>{show && <Writer />}</AdminQueryProvider>;
  const { rerender } = render(route(true));

  const key = ["farm-supply", farmId, "source", productId];
  const other = ["farm-supply", farmId, "source", "unaffected"];
  const draft = ["farm-supply", farmId, "bulk-draft"];
  client.setQueryData(key, { cached: true });
  client.setQueryData(other, { cached: true });
  client.setQueryData(draft, input);
  act(() => {
    operation = writer.submit(input, success);
  });
  await waitFor(() => expect(finish).toBeTypeOf("function"));
  rerender(route(false));
  await act(async () => {
    finish({ farm_id: farmId, created_count: 1, idempotent_replay: false });
    await operation;
  });
  expect(success).not.toHaveBeenCalled();
  expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  expect(client.getQueryState(other)?.isInvalidated).toBe(false);
  expect(client.getQueryState(draft)).toBeUndefined();
});

it("commits a verified recovery receipt without sending another bulk write", async () => {
  const { useFarmBulkWrite } = await import("@/lib/use-farm-bulk-write");
  const confirmed = vi.fn();
  const { result } = renderHook(
    () => ({ writer: useFarmBulkWrite(farmId), client: useQueryClient() }),
    { wrapper: AdminQueryProvider },
  );
  const key = ["farm-supply", farmId, "source", productId];
  result.current.client.setQueryData(key, { cached: true });
  api.postFarmBulkSupply.mockRejectedValueOnce(
    Object.assign(new Error("upstream_timeout"), { status: 504 }),
  );
  api.recoverFarmBulkSupply.mockResolvedValueOnce({
    farm_id: farmId,
    created_count: 1,
    idempotent_replay: true,
  });
  await act(async () => result.current.writer.submit(input, confirmed));
  await waitFor(() => expect(result.current.writer.failure?.kind).toBe("unknown"));
  const sent = api.postFarmBulkSupply.mock.calls[0][1];
  await act(async () => result.current.writer.recover(confirmed));
  expect(api.recoverFarmBulkSupply).toHaveBeenCalledExactlyOnceWith(farmId, sent);
  expect(api.postFarmBulkSupply).toHaveBeenCalledTimes(1);
  expect(confirmed).toHaveBeenCalledExactlyOnceWith(sent);
  expect(result.current.client.getQueryState(key)?.isInvalidated).toBe(true);
  await waitFor(() => expect(result.current.writer.locked).toBe(false));
});

it("reconstructs an unknown transaction on remount and retires it after permission loss", async () => {
  const { useFarmBulkWrite } = await import("@/lib/use-farm-bulk-write");
  let client!: QueryClient;
  let writer!: ReturnType<typeof useFarmBulkWrite>;
  const success = vi.fn();
  const denied = Object.assign(new Error("forbidden"), { status: 403 });
  api.postFarmBulkSupply.mockRejectedValueOnce(new Error("network_error"));
  api.recoverFarmBulkSupply.mockRejectedValueOnce(denied);
  function Writer() {
    client = useQueryClient();
    writer = useFarmBulkWrite(farmId);
    return null;
  }
  const route = (show: boolean) => <AdminQueryProvider>{show && <Writer />}</AdminQueryProvider>;
  const { rerender } = render(route(true));

  await act(async () => writer.submit(input, success));
  await waitFor(() => expect(writer.failure?.kind).toBe("unknown"));
  rerender(route(false));
  rerender(route(true));
  expect(writer.intent).toMatchObject(input);
  expect(writer.locked).toBe(true);

  await act(async () => writer.recover(success));

  expect(farmAccess(client).error).toBe(denied);
  await waitFor(() => expect(writer.intent).toBeUndefined());
  expect(client.getMutationCache().getAll()).toEqual([]);
  expect(success).not.toHaveBeenCalled();
});

it("maps backend item validation by the submitted product order", async () => {
  const { useFarmBulkWrite } = await import("@/lib/use-farm-bulk-write");
  const secondId = "2ac08eac-794b-4acd-a07c-c3bc9d34803b";
  api.postFarmBulkSupply.mockRejectedValueOnce(
    Object.assign(new Error("validation_error"), {
      status: 400,
      payload: {
        end_date: ["An expired stock batch cannot be saved."],
        items: { "1": { quantity_units: ["Check quantity."] } },
      },
    }),
  );
  const { result } = renderHook(() => useFarmBulkWrite(farmId), { wrapper: AdminQueryProvider });
  await act(async () =>
    result.current.submit(
      { ...input, items: [...input.items, { ...input.items[0], product_id: secondId }] },
      vi.fn(),
    ),
  );

  await waitFor(() =>
    expect(result.current.failure).toMatchObject({
      kind: "rejected",
      fieldErrors: { end_date: "An expired stock batch cannot be saved." },
      itemErrors: { [secondId]: "Check quantity." },
    }),
  );
});

it("never accepts a receipt after the backend reports that the key belongs to a different intent", async () => {
  const { useFarmBulkWrite } = await import("@/lib/use-farm-bulk-write");
  const success = vi.fn();
  const { result } = renderHook(() => useFarmBulkWrite(farmId), { wrapper: AdminQueryProvider });
  api.postFarmBulkSupply.mockRejectedValueOnce(
    Object.assign(new Error("idempotency_conflict"), { status: 409 }),
  );
  await act(async () => result.current.submit(input, success));
  await waitFor(() => expect(result.current.failure?.kind).toBe("idempotency_conflict"));

  act(() => {
    void result.current.recover(success);
    void result.current.retry(success);
    void result.current.submit(input, success);
  });

  expect(api.recoverFarmBulkSupply).not.toHaveBeenCalled();
  expect(api.postFarmBulkSupply).toHaveBeenCalledTimes(1);
  expect(success).not.toHaveBeenCalled();
  expect(result.current.locked).toBe(true);
});

it("requires explicit review before replacing a source-conflicted intent", async () => {
  const { useFarmBulkWrite } = await import("@/lib/use-farm-bulk-write");
  const { result } = renderHook(() => useFarmBulkWrite(farmId), { wrapper: AdminQueryProvider });
  const code = "farm_product_version_conflict";
  api.postFarmBulkSupply.mockRejectedValueOnce(
    Object.assign(new Error(code), {
      status: 409,
      payload: { errors: [{ code, context: { item_index: 0, product_id: productId } }] },
    }),
  );
  await act(async () => result.current.submit(input, vi.fn()));
  await waitFor(() =>
    expect(result.current.failure).toMatchObject({
      kind: "conflict",
      itemCodes: { [productId]: code },
      intent: input,
    }),
  );

  act(() => {
    void result.current.submit(input, vi.fn());
  });
  expect(api.postFarmBulkSupply).toHaveBeenCalledTimes(1);
});

it.each(["farm_product_version_conflict", "farm_product_identity_changed"])(
  "settles an unknown attempt when a same-key POST proves %s",
  async (code) => {
    const { useFarmBulkWrite } = await import("@/lib/use-farm-bulk-write");
    const { result } = renderHook(() => useFarmBulkWrite(farmId), { wrapper: AdminQueryProvider });
    const success = vi.fn();
    api.postFarmBulkSupply.mockRejectedValueOnce(new Error("network_error"));
    await act(async () => result.current.submit(input, success));
    await waitFor(() => expect(result.current.failure?.kind).toBe("unknown"));

    api.postFarmBulkSupply.mockRejectedValueOnce(
      Object.assign(new Error(code), {
        status: 409,
        payload: { errors: [{ code, context: { item_index: 0, product_id: productId } }] },
      }),
    );
    await act(async () => result.current.retry(success));

    await waitFor(() => expect(result.current.failure?.kind).toBe("conflict"));
    expect(result.current.failure?.itemCodes).toEqual({ [productId]: code });
    expect(result.current.locked).toBe(false);
    expect(success).not.toHaveBeenCalled();
  },
);

it("blocks a bulk transaction synchronously while an existing source write is pending", async () => {
  const { useFarmBulkWrite } = await import("@/lib/use-farm-bulk-write");
  const { result } = renderHook(
    () => ({ client: useQueryClient(), write: useFarmBulkWrite(farmId) }),
    { wrapper: AdminQueryProvider },
  );
  let finish!: () => void;
  const write = new Promise<void>((resolve) => (finish = resolve));
  const { client } = result.current;
  const entry = client.getMutationCache().build(client, {
    mutationKey: [...farmSupplyWriteKey(farmId), "source", productId],
    mutationFn: () => write,
  });
  let operation: Promise<void> | undefined;

  act(() => {
    operation = entry.execute(undefined);
    void result.current.write.submit(input, vi.fn());
  });

  await waitFor(() => expect(result.current.write.blocked).toBe(true));
  expect(api.postFarmBulkSupply).not.toHaveBeenCalled();
  await act(async () => {
    finish();
    await operation;
  });
  await waitFor(() => expect(result.current.write.blocked).toBe(false));
});

it("ignores a late verified receipt after the original query session is retired", async () => {
  const { useFarmBulkWrite } = await import("@/lib/use-farm-bulk-write");
  const success = vi.fn();
  let retireScope!: () => void;
  let finish!: (value: unknown) => void;
  let operation: Promise<void> | undefined;
  api.postFarmBulkSupply.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
  const { result } = renderHook(
    () => ({ client: useQueryClient(), write: useFarmBulkWrite(farmId) }),
    {
      wrapper: ({ children }) => (
        <AdminQueryProvider
          ref={(retire) => {
            if (retire) retireScope = retire;
          }}
        >
          {children}
        </AdminQueryProvider>
      ),
    },
  );
  const { client } = result.current;
  client.setQueryData(["farm-supply", farmId, "source", productId], { private: true });
  act(() => {
    operation = result.current.write.submit(input, success);
  });
  await waitFor(() => expect(finish).toBeTypeOf("function"));

  await act(async () => {
    retireScope();
    finish({ farm_id: farmId, created_count: 1, idempotent_replay: false });
    await operation;
  });

  expect(success).not.toHaveBeenCalled();
  expect(client.getMutationCache().getAll()).toEqual([]);
  expect(client.getQueryData(["farm-supply", farmId, "source", productId])).toBeUndefined();
});
