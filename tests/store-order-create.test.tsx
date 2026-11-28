import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { type RefObject } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { AdminI18nProvider, useAdminI18n } from "@/components/admin-i18n-provider";
import { AdminQueryProvider } from "@/components/admin-query-provider";
import { StoreOrderCreate } from "@/components/store-order-create";
import { ToastProvider } from "@/components/toast-provider";
import { adminTodayIso, isoDateToAdminInput } from "@/lib/admin-date";
import type { StoreOrderCreateInput, StoreOrderQuoteInput } from "@/lib/admin-store-order-api";
import { storeOrderDateRange } from "@/lib/store-order-draft";
import type { StoreProduct } from "@/lib/types";

const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/use-administrative-unit-names", () => ({
  useAdministrativeUnitNames: () => ({ provinceName: "Đắk Lắk", wardName: "Ward" }),
}));
vi.mock("@/components/store-order-create-buyer", () => ({
  useStoreOrderBuyer: (userId: string | null) => ({
    eligible: Boolean(userId),
    address: userId ? { ...address, is_supported: true } : null,
  }),
  StoreOrderBuyerFields: ({
    onUserChange,
    onBuyerTypeChange,
    onGuestChange,
  }: {
    onUserChange: (id: string) => void;
    onBuyerTypeChange: (type: "guest") => void;
    onGuestChange: (guest: typeof address) => void;
  }) => (
    <>
      <button type="button" onClick={() => onUserChange(userId)}>
        Choose Taylor
      </button>
      <button
        type="button"
        onClick={() => {
          onBuyerTypeChange("guest");
          onGuestChange({ ...address, phone_number: "0901234567" });
        }}
      >
        Choose guest
      </button>
    </>
  ),
}));
vi.mock("@/components/store-order-product-picker", () => ({
  StoreOrderProductPicker: ({
    opened,
    onAdd,
  }: {
    opened: boolean;
    onAdd: (values: StoreProduct[]) => void;
  }) =>
    opened ? (
      <button type="button" onClick={() => onAdd([product])}>
        Select Tomato
      </button>
    ) : null,
}));

const userId = "22222222-2222-4222-8222-222222222222";
const orderId = "44444444-4444-4444-8444-444444444444";
const address = {
  recipient_name: "Taylor",
  phone_number: "+84901234567",
  province_code: "66",
  ward_code: "22015",
  address: "12 Nguyen Hue",
};
const product: StoreProduct = {
  id: "11111111-1111-4111-8111-111111111111",
  category_id: "33333333-3333-4333-8333-333333333333",
  category_slug: "vegetables",
  sku: "TOMATO",
  slug: "tomato",
  unit_size: "1.000",
  unit_label_vi: "kg",
  unit_label_en: "kg",
  retail_price_vnd: "45000",
  csa_quota_group_id: null,
  csa_quota_group: null,
  csa_quota_cost: 0,
  primary_image_id: null,
  primary_image: null,
  status: "active",
  translations: [{ locale: "en", name: "Tomato", description: "", short_description: "" }],
  created_at: "2026-10-31T10:00:00Z",
  updated_at: "2026-10-31T10:00:00Z",
};
const confirmation = "c".repeat(64);
const collection = "/api/backend/admin/store-orders";
const quotePath = `${collection}/quote`;

function readBody(init: RequestInit | undefined): unknown {
  return JSON.parse(String(init?.body));
}

function makeQuote(input: StoreOrderQuoteInput, storePrice = 45000, recipient = address) {
  const lines = input.lines.map((line) => {
    const unitPrice = input.kind === "historical" ? Number(line.unit_price_vnd) : storePrice;
    return {
      product_id: line.product_id,
      name: "Quoted Tomato",
      sku: "TOMATO-CURRENT",
      unit_size: "1.250",
      unit_label: "kg",
      quantity: line.quantity,
      unit_price_vnd: String(unitPrice),
      subtotal_vnd: String(unitPrice * line.quantity),
      available_quantity: input.kind === "historical" ? null : 10,
    };
  });
  const subtotal = lines.reduce((sum, line) => sum + Number(line.subtotal_vnd), 0);
  const shipping = input.kind === "historical" ? Number(input.shipping_fee_vnd) : 30000;
  return Response.json({
    data: {
      delivery_date: input.delivery_date,
      shipping_address: recipient,
      shipping_address_version: input.buyer_user_id ? "a".repeat(64) : null,
      shipping_discount_reason: null,
      subtotal_vnd: String(subtotal),
      shipping_fee_vnd: String(shipping),
      total_vnd: String(subtotal + shipping),
      lines,
      confirmation,
    },
  });
}

function created(input: StoreOrderCreateInput, data?: unknown) {
  return Response.json(
    {
      data,
      meta: {
        action_receipt: {
          action: "create_store_order",
          resource_id: orderId,
          idempotency_key: input.idempotency_key,
        },
      },
    },
    { status: 201 },
  );
}

function businessError(code: string, status: number) {
  return Response.json({ errors: [{ code }] }, { status });
}

function SwitchLocale() {
  const { setLocale } = useAdminI18n();
  return (
    <button type="button" onClick={() => setLocale("vi")}>
      Chuyển ngôn ngữ
    </button>
  );
}

function tree(show = true, session = "one", scope?: RefObject<(() => void) | null>) {
  return (
    <AdminI18nProvider initialLocale="en">
      <ToastProvider>
        <AdminQueryProvider key={session} ref={scope}>
          <SwitchLocale />
          {show && <StoreOrderCreate />}
        </AdminQueryProvider>
      </ToastProvider>
    </AdminI18nProvider>
  );
}

function setupDraft(kind: "new" | "historical" = "new", buyer: "user" | "guest" = "user") {
  if (kind === "historical")
    fireEvent.click(screen.getByRole("radio", { name: "Delivered order" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Delivery date" }), {
    target: {
      value: isoDateToAdminInput(kind === "new" ? adminTodayIso() : storeOrderDateRange(kind).max),
    },
  });
  fireEvent.click(
    screen.getByRole("button", { name: buyer === "user" ? "Choose Taylor" : "Choose guest" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Add products" }));
  fireEvent.click(screen.getByRole("button", { name: "Select Tomato" }));
  fireEvent.change(screen.getByRole("textbox", { name: /Quantity/ }), { target: { value: "2" } });
  if (kind === "historical") {
    fireEvent.change(screen.getByRole("textbox", { name: /Unit price/ }), {
      target: { value: "34000" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /Delivery fee/i }), {
      target: { value: "7000" },
    });
  }
}

function submitDraft() {
  fireEvent.click(screen.getByRole("button", { name: "Create order" }));
}
async function approveQuote() {
  const dialog = await screen.findByRole("dialog", { name: "Review order details" });
  const confirm = within(dialog).getByRole("button", { name: "Confirm order" });
  fireEvent.click(confirm);
  fireEvent.click(confirm);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it.each([
  ["new", "user"],
  ["new", "guest"],
  ["historical", "user"],
  ["historical", "guest"],
] as const)(
  "quotes and creates a %s order for a %s using the same normalized intent",
  async (kind, buyer) => {
    const requests: Array<{ path: string; body: unknown }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: string, init: RequestInit) => {
        const body = readBody(init);
        requests.push({ path, body });
        if (path === quotePath) return makeQuote(body as StoreOrderQuoteInput);
        return created(body as StoreOrderCreateInput, { id: orderId });
      }),
    );
    render(tree());
    expect(screen.getByRole("heading", { name: "Create order" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "New order" })).toBeChecked();
    submitDraft();
    expect(requests).toEqual([]);
    setupDraft(kind, buyer);
    submitDraft();
    const dialog = await screen.findByRole("dialog", { name: "Review order details" });
    expect(within(dialog).getByText("12 Nguyen Hue, Ward, Đắk Lắk")).toBeVisible();
    expect(within(dialog).getByText("Quoted Tomato")).toBeVisible();
    expect(within(dialog).getByText("TOMATO-CURRENT · 1.25 kg")).toBeVisible();
    expect(requests).toHaveLength(1);
    await approveQuote();
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(`/store-orders/${orderId}`));
    expect(requests.map(({ path }) => path)).toEqual([quotePath, collection]);
    expect(requests[0].body).toEqual({
      kind,
      locale: "en",
      include_line_snapshot: true,
      delivery_date: kind === "new" ? adminTodayIso() : storeOrderDateRange("historical").max,
      ...(buyer === "user" ? { buyer_user_id: userId } : { guest: address }),
      ...(kind === "historical" ? { shipping_fee_vnd: "7000" } : {}),
      lines: [
        {
          product_id: product.id,
          quantity: 2,
          ...(kind === "historical" ? { unit_price_vnd: "34000" } : {}),
        },
      ],
    });
    expect(requests[1].body).toEqual({
      ...(requests[0].body as object),
      confirmation,
      idempotency_key: expect.any(String),
    });
  },
);

it("abandons an in-flight quote when the draft changes and keeps the draft across locale changes", async () => {
  let finish!: (response: Response) => void;
  let submitted: StoreOrderQuoteInput | undefined;
  let signal: AbortSignal | null | undefined;
  const fetcher = vi.fn((path: string, init: RequestInit) => {
    expect(path).toBe(quotePath);
    submitted = readBody(init) as StoreOrderQuoteInput;
    signal = init.signal;
    return new Promise<Response>((resolve) => (finish = resolve));
  });
  vi.stubGlobal("fetch", fetcher);
  render(tree());
  setupDraft();
  submitDraft();
  fireEvent.change(screen.getByRole("textbox", { name: /Quantity/ }), { target: { value: "3" } });
  expect(signal?.aborted).toBe(true);
  if (submitted) {
    const quote = makeQuote(submitted);
    await act(async () => finish(quote));
  }
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Chuyển ngôn ngữ" }));
  expect(screen.getByRole("textbox", { name: /Số lượng/ })).toHaveValue("3");
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("requires a second confirmation after a price or address conflict", async () => {
  let writes = 0;
  let quotes = 0;
  const fetcher = vi.fn(async (path: string, init: RequestInit) => {
    if (path === quotePath) {
      quotes++;
      return makeQuote(
        readBody(init) as StoreOrderQuoteInput,
        quotes === 1 ? 45000 : 47000,
        quotes === 1 ? address : { ...address, address: "Updated street" },
      );
    }
    writes++;
    return writes === 1
      ? businessError("store_requote_required", 409)
      : created(readBody(init) as StoreOrderCreateInput);
  });
  vi.stubGlobal("fetch", fetcher);
  render(tree());
  setupDraft();
  submitDraft();
  await approveQuote();
  expect(await screen.findByText(/Get a new quote and confirm it again/)).toBeVisible();
  expect(writes).toBe(1);
  expect(screen.getByRole("textbox", { name: /Quantity/ })).toHaveValue("2");
  submitDraft();
  const dialog = await screen.findByRole("dialog", { name: "Review order details" });
  expect(within(dialog).getByText(/Updated street/)).toBeVisible();
  expect(within(dialog).getByText(/recipient information changed/)).toBeVisible();
  expect(writes).toBe(1);
  await approveQuote();
  await waitFor(() => expect(router.replace).toHaveBeenCalledOnce());
});

it.each([499, 502, 504])(
  "retains the exact intent across remount and an early 404 after HTTP %s",
  async (status) => {
    const bodies: string[] = [];
    const fetcher = vi.fn(async (path: string, init: RequestInit) => {
      if (path === quotePath) return makeQuote(readBody(init) as StoreOrderQuoteInput);
      if (init.method === "POST") {
        bodies.push(String(init.body));
        return bodies.length === 1
          ? businessError("upstream_unavailable", status)
          : created(readBody(init) as StoreOrderCreateInput);
      }
      expect(path).toMatch(/\?creation_key=/);
      return businessError("create_receipt_not_found", 404);
    });
    vi.stubGlobal("fetch", fetcher);
    const view = render(tree());
    setupDraft();
    submitDraft();
    await approveQuote();
    await screen.findByRole("button", { name: "Check result" });
    view.rerender(tree(false));
    view.rerender(tree());
    fireEvent.click(await screen.findByRole("button", { name: "Check result" }));
    expect(await screen.findByText(/may still be processing/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Create order" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Send the same request again" }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledOnce());
    expect(bodies).toEqual([bodies[0], bodies[0]]);
  },
);

it("keeps the receipt across route remount and suppresses completion after a session change", async () => {
  let finish!: (response: Response) => void;
  let request: StoreOrderCreateInput | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn((path: string, init: RequestInit) => {
      if (path === quotePath)
        return Promise.resolve(makeQuote(readBody(init) as StoreOrderQuoteInput));
      request = readBody(init) as StoreOrderCreateInput;
      return new Promise<Response>((resolve) => (finish = resolve));
    }),
  );
  const view = render(tree());
  setupDraft();
  submitDraft();
  await approveQuote();
  view.rerender(tree(false));
  if (request) {
    const response = created(request, { malformed: true });
    await act(async () => finish(response));
  }
  expect(router.replace).not.toHaveBeenCalled();
  view.rerender(tree());
  await waitFor(() =>
    expect(router.replace).toHaveBeenCalledExactlyOnceWith(`/store-orders/${orderId}`),
  );
  expect(screen.getByRole("button", { name: "Create order" })).toBeEnabled();
  router.replace.mockClear();
  view.rerender(tree(true, "two"));
  expect(screen.queryByRole("link", { name: "Open order details" })).not.toBeInTheDocument();
  setupDraft();
  submitDraft();
  await approveQuote();
  view.rerender(tree(true, "three"));
  if (request) {
    const response = created(request);
    await act(async () => finish(response));
  }
  expect(router.replace).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Create order" })).toBeEnabled();
});

it.each([false, true])(
  "restores the rejected draft and error across remount when the page is already open: %s",
  async (openBeforeResponse) => {
    let finish!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn((path: string, init: RequestInit) => {
        if (path === quotePath)
          return Promise.resolve(makeQuote(readBody(init) as StoreOrderQuoteInput));
        return new Promise<Response>((resolve) => (finish = resolve));
      }),
    );
    const view = render(tree());
    setupDraft("historical", "guest");
    submitDraft();
    await approveQuote();
    view.rerender(tree(false));
    if (openBeforeResponse) view.rerender(tree());
    await act(async () =>
      finish(Response.json({ lines: [{ quantity: ["Too much."] }] }, { status: 400 })),
    );
    if (!openBeforeResponse) view.rerender(tree());
    const quantity = await screen.findByRole("textbox", { name: /Quantity/ });
    await waitFor(() => expect(quantity).toHaveFocus());
    expect(quantity).toHaveValue("2");
    expect(quantity).toBeEnabled();
    expect(quantity).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("textbox", { name: /Unit price/ })).toHaveValue("34000");
    expect(screen.getByRole("textbox", { name: /Delivery fee/i })).toHaveValue("7000");
    expect(router.replace).not.toHaveBeenCalled();
  },
);

it("recovers the matching receipt after an unreadable create response", async () => {
  let sent: StoreOrderCreateInput | undefined;
  const fetcher = vi.fn(async (path: string, init: RequestInit) => {
    if (path === quotePath) return makeQuote(readBody(init) as StoreOrderQuoteInput);
    if (init.method === "POST") {
      sent = readBody(init) as StoreOrderCreateInput;
      return Response.json({ data: null, meta: { action_receipt: { action: "create_product" } } });
    }
    expect(sent).toBeDefined();
    if (!sent) throw new Error("Missing creation request");
    expect(path).toBe(`${collection}?creation_key=${sent.idempotency_key}`);
    return created(sent, null);
  });
  vi.stubGlobal("fetch", fetcher);
  render(tree());
  setupDraft();
  submitDraft();
  await approveQuote();
  fireEvent.click(await screen.findByRole("button", { name: "Check result" }));
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith(`/store-orders/${orderId}`));
  expect(fetcher.mock.calls.map(([path]) => path.split("?")[0])).toEqual([
    quotePath,
    collection,
    collection,
  ]);
});

it("checks a conflicting key without treating the other order as this intent", async () => {
  let sent: StoreOrderCreateInput | undefined;
  const fetcher = vi.fn(async (path: string, init: RequestInit) => {
    if (path === quotePath) return makeQuote(readBody(init) as StoreOrderQuoteInput);
    if (init.method === "POST") {
      sent = readBody(init) as StoreOrderCreateInput;
      return businessError("store_idempotency_conflict", 409);
    }
    if (!sent) throw new Error("Missing creation request");
    return created(sent, { id: orderId });
  });
  vi.stubGlobal("fetch", fetcher);
  render(tree());
  setupDraft();
  submitDraft();
  await approveQuote();
  const check = await screen.findByRole("button", { name: "Check result" });
  expect(
    screen.queryByRole("button", { name: "Send the same request again" }),
  ).not.toBeInTheDocument();
  fireEvent.click(check);
  expect(await screen.findByText(/belongs to another order/)).toBeVisible();
  expect(router.replace).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Create another order" }));
  expect(screen.getByRole("button", { name: "Create order" })).toBeEnabled();
  expect(fetcher).toHaveBeenCalledTimes(3);
});

it("keeps the draft and original key after a remounted retry gets a requote conflict", async () => {
  const bodies: string[] = [];
  const fetcher = vi.fn(async (path: string, init: RequestInit) => {
    if (path === quotePath) return makeQuote(readBody(init) as StoreOrderQuoteInput);
    if (init.method === "POST") {
      bodies.push(String(init.body));
      return bodies.length === 1
        ? businessError("upstream_timeout", 504)
        : businessError("store_requote_required", 409);
    }
    return created(JSON.parse(bodies[0]) as StoreOrderCreateInput, { id: orderId });
  });
  vi.stubGlobal("fetch", fetcher);
  const view = render(tree());
  setupDraft();
  submitDraft();
  await approveQuote();
  await screen.findByRole("button", { name: "Check result" });
  view.rerender(tree(false));
  view.rerender(tree());
  expect(screen.getByRole("textbox", { name: /Quantity/ })).toHaveValue("2");
  fireEvent.click(await screen.findByRole("button", { name: "Send the same request again" }));
  expect(await screen.findByText(/original result is still unknown/)).toBeVisible();
  expect(screen.getByRole("button", { name: "Create order" })).toBeDisabled();
  expect(bodies).toEqual([bodies[0], bodies[0]]);
  fireEvent.click(screen.getByRole("button", { name: "Check result" }));
  await waitFor(() => expect(router.replace).toHaveBeenCalledOnce());
});

it("rejects the entire multiline numeric paste and allows a clean replacement", async () => {
  const fetcher = vi.fn(async (_path: string, init: RequestInit) =>
    makeQuote(readBody(init) as StoreOrderQuoteInput),
  );
  vi.stubGlobal("fetch", fetcher);
  render(tree());
  setupDraft("historical", "guest");
  const unitPrice = screen.getByRole<HTMLInputElement>("textbox", { name: /Unit price/ });
  fireEvent.change(unitPrice, { target: { value: "" } });
  fireEvent.paste(unitPrice, { clipboardData: { getData: () => "34\n000" } });
  expect(unitPrice).toHaveValue("");
  submitDraft();
  expect(screen.getByText(/Enter a whole VND amount/)).toBeVisible();
  expect(fetcher).not.toHaveBeenCalled();
  fireEvent.change(unitPrice, { target: { value: "34000" } });
  submitDraft();
  expect(await screen.findByRole("dialog", { name: "Review order details" })).toBeVisible();
});

it("restores focus after closing the confirmation and moves it to recovery when needed", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init: RequestInit) =>
      path === quotePath
        ? makeQuote(readBody(init) as StoreOrderQuoteInput)
        : businessError("upstream_timeout", 504),
    ),
  );
  render(tree());
  setupDraft();
  const submitButton = screen.getByRole("button", { name: "Create order" });
  submitButton.focus();
  submitDraft();
  const dialog = await screen.findByRole("dialog", { name: "Review order details" });
  within(dialog).getByRole("button", { name: "Cancel" }).focus();
  fireEvent.keyDown(dialog, { key: "Escape" });
  await waitFor(() => expect(submitButton).toHaveFocus());
  submitDraft();
  await approveQuote();
  const recovery = await screen.findByRole("button", { name: "Check result" });
  expect(document.activeElement).toContainElement(recovery);
});

it("focuses the first invalid control and maps Backend errors to the submitted product row", async () => {
  const fetcher = vi.fn(async () =>
    Response.json({ lines: [{ quantity: ["Too much."] }] }, { status: 400 }),
  );
  vi.stubGlobal("fetch", fetcher);
  render(tree());
  submitDraft();
  expect(screen.getByRole("textbox", { name: "Delivery date" })).toHaveFocus();
  setupDraft();
  submitDraft();
  const quantity = screen.getByRole("textbox", { name: /Quantity/ });
  await waitFor(() => expect(quantity).toHaveFocus());
  expect(quantity).toHaveAttribute("aria-invalid", "true");
  expect(quantity).toHaveValue("2");
});

it("restores the draft only when Backend confirms that an unknown request was closed", async () => {
  let sent: StoreOrderCreateInput | undefined;
  const fetcher = vi.fn(async (path: string, init: RequestInit) => {
    if (path === quotePath) return makeQuote(readBody(init) as StoreOrderQuoteInput);
    if (path === collection) {
      sent = readBody(init) as StoreOrderCreateInput;
      return businessError("upstream_timeout", 504);
    }
    expect(path).toBe(`${collection}/close-creation`);
    expect(readBody(init)).toEqual({ idempotency_key: sent?.idempotency_key });
    return Response.json({
      data: { closed: true },
      meta: {
        action_receipt: {
          action: "create_store_order",
          idempotency_key: sent?.idempotency_key,
          resource_id: null,
        },
      },
    });
  });
  vi.stubGlobal("fetch", fetcher);
  render(tree());
  setupDraft();
  submitDraft();
  await approveQuote();
  fireEvent.click(await screen.findByRole("button", { name: "Close request and edit" }));
  expect(await screen.findByText(/previous request was closed/i)).toBeVisible();
  const quantity = screen.getByRole("textbox", { name: /Quantity/ });
  expect(quantity).toHaveValue("2");
  expect(quantity).toBeEnabled();
  expect(screen.getByRole("button", { name: "Create order" })).toBeEnabled();
  expect(router.replace).not.toHaveBeenCalled();
});
