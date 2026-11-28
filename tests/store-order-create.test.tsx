import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useQueryClient } from "@tanstack/react-query";
import { type RefObject } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { AdminI18nProvider, useAdminI18n } from "@/components/admin-i18n-provider";
import { AdminQueryProvider } from "@/components/admin-query-provider";
import { StoreOrderCreate } from "@/components/store-order-create";
import { ToastProvider } from "@/components/toast-provider";
import { adminTodayIso, isoDateToAdminInput } from "@/lib/admin-date";
import type { StoreOrderCreateInput, StoreOrderQuoteInput } from "@/lib/admin-store-order-api";
import { storeOrderDateRange } from "@/lib/store-order-draft";
import { formatStoreMoney } from "@/lib/store-orders";
import type { StoreProduct } from "@/lib/types";
import { useAcknowledgeStoreOrderCreation } from "@/lib/use-store-order-creation";
import { deferred } from "./deferred";
import { selectOption } from "./select-option";

const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/use-administrative-unit-names", () => ({
  useAdministrativeUnitNames: () => ({ provinceName: "Đắk Lắk", wardName: "Ward" }),
}));
vi.mock("@/components/store-order-create-buyer", async (importOriginal) => {
  const { StoreOrderBuyerFields } =
    await importOriginal<typeof import("@/components/store-order-create-buyer")>();
  return {
    useStoreOrderBuyer: (userId: string | null) => ({
      eligible: Boolean(userId),
      address: userId ? { ...address, is_supported: true } : null,
    }),
    StoreOrderBuyerFields: (props: Parameters<typeof StoreOrderBuyerFields>[0]) =>
      props.buyerType === "guest" ? (
        <StoreOrderBuyerFields {...props} />
      ) : (
        <>
          <button type="button" onClick={() => props.onUserChange(userId)}>
            Choose Taylor
          </button>
          <button type="button" onClick={() => props.onBuyerTypeChange("guest")}>
            Choose guest
          </button>
        </>
      ),
  };
});
vi.mock("@/components/store-order-product-picker", () => ({
  StoreOrderProductPicker: ({
    opened,
    onAdd,
  }: {
    opened: boolean;
    onAdd: (values: StoreProduct[]) => void;
  }) =>
    opened ? (
      <>
        <button type="button" onClick={() => onAdd([product])}>
          Select Tomato
        </button>
        <button type="button" onClick={() => onAdd([discontinuedProduct])}>
          Select Basil
        </button>
      </>
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
const discontinuedProduct: StoreProduct = {
  ...product,
  id: "55555555-5555-4555-8555-555555555555",
  sku: "BASIL",
  slug: "basil",
  retail_price_vnd: "12000",
  status: "discontinued",
  translations: [{ locale: "en", name: "Basil", description: "", short_description: "" }],
};
const confirmation = "c".repeat(64);
const collection = "/api/backend/admin/store-orders";
const quotePath = `${collection}/quote`;
const shippingAreasPath = "/api/backend/public/shipping-areas?locale=";
const recoverySlot = "nfv-admin-store-order-recovery:v1:test-one";
const supportedShippingAreas = [
  {
    province_code: "66",
    province_name: "Đắk Lắk",
    wards: [{ ward_code: "22015", ward_name: "Ward", shipping_fee_vnd: "30000" }],
  },
  {
    province_code: "01",
    province_name: "Hà Nội",
    wards: [{ ward_code: "00004", ward_name: "Replacement ward", shipping_fee_vnd: "15000" }],
  },
];

function stubOrderFetch(
  orderFetch: (path: string, init: RequestInit) => Promise<Response>,
  getAreas = async () => Response.json({ data: supportedShippingAreas }),
) {
  vi.stubGlobal("fetch", (path: string, init: RequestInit) =>
    path.startsWith(shippingAreasPath) ? getAreas() : orderFetch(path, init),
  );
}

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

function AcknowledgeDetail({ id }: { id?: string }) {
  useAcknowledgeStoreOrderCreation(id);
  return null;
}

function RefreshShippingAreas() {
  const client = useQueryClient();
  return (
    <button
      type="button"
      onClick={() => void client.invalidateQueries({ queryKey: ["supported-shipping-areas"] })}
    >
      Refresh shipping areas
    </button>
  );
}

function tree(
  show = true,
  session = "one",
  scope?: RefObject<(() => void) | null>,
  loadedOrderId?: string,
) {
  return (
    <div data-admin-order-recovery={`test-${session}`}>
      <AdminI18nProvider initialLocale="en">
        <ToastProvider>
          <AdminQueryProvider key={session} ref={scope}>
            <SwitchLocale />
            <RefreshShippingAreas />
            <AcknowledgeDetail id={loadedOrderId} />
            {show && <StoreOrderCreate />}
          </AdminQueryProvider>
        </ToastProvider>
      </AdminI18nProvider>
    </div>
  );
}

function selectOrder(kind: "new" | "historical", buyer: "user" | "guest") {
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
}

function addProduct(name = "Tomato") {
  fireEvent.click(screen.getByRole("button", { name: "Add products" }));
  fireEvent.click(screen.getByRole("button", { name: `Select ${name}` }));
}

function setupDraft(kind: "new" | "historical" = "new", buyer: "user" | "guest" = "user") {
  selectOrder(kind, buyer);
  addProduct();
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

async function fillGuestAddress() {
  fireEvent.change(screen.getByRole("textbox", { name: "Recipient name" }), {
    target: { value: address.recipient_name },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "Phone number" }), {
    target: { value: "0901234567" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "Detailed address" }), {
    target: { value: address.address },
  });
  const province = screen.getByRole("combobox", { name: "Province/City" });
  await waitFor(() => expect(province).toBeEnabled());
  selectOption(province, address.province_code);
  selectOption(screen.getByRole("combobox", { name: "Ward/Commune" }), address.ward_code);
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

it.each(["new", "historical"] as const)(
  "blocks quote and creation for an unsupported %s guest address",
  async (kind) => {
    const orderFetch = vi.fn(async (path: string, init: RequestInit) => {
      if (path === quotePath) return makeQuote(readBody(init) as StoreOrderQuoteInput);
      return created(readBody(init) as StoreOrderCreateInput, { id: orderId });
    });
    let areas = supportedShippingAreas;
    const getAreas = vi.fn(async () => Response.json({ data: areas }));
    stubOrderFetch(orderFetch, getAreas);
    render(tree());
    expect(getAreas).not.toHaveBeenCalled();
    setupDraft(kind, "guest");
    await fillGuestAddress();
    expect(getAreas).toHaveBeenCalledTimes(1);
    const province = screen.getByRole("combobox", { name: "Province/City" });
    const refresh = () =>
      fireEvent.click(screen.getByRole("button", { name: "Refresh shipping areas" }));
    const unsupported = () =>
      screen.getByText("This address is not currently in a supported delivery area.");

    areas = supportedShippingAreas.slice(1);
    refresh();
    await waitFor(() => expect(unsupported()).toBeVisible());
    submitDraft();
    await waitFor(() => expect(province).toHaveFocus());
    expect(orderFetch).not.toHaveBeenCalled();

    areas = supportedShippingAreas;
    refresh();
    await waitFor(() => expect(province).toHaveValue("Đắk Lắk"));
    submitDraft();
    const dialog = await screen.findByRole("dialog", { name: "Review order details" });

    areas = supportedShippingAreas.slice(1);
    refresh();
    await waitFor(() => expect(unsupported()).toBeVisible());
    await act(async () =>
      fireEvent.click(within(dialog).getByRole("button", { name: "Confirm order" })),
    );
    await waitFor(() => expect(province).toHaveFocus());
    expect(orderFetch.mock.calls.map(([path]) => path)).toEqual([quotePath]);
    expect(screen.queryByRole("dialog", { name: "Review order details" })).toBeNull();
    expect(screen.getByRole("textbox", { name: "Detailed address" })).toHaveValue(address.address);
  },
);

it("rechecks a historical guest area without cache invalidation before both quote and confirmation", async () => {
  let areas = supportedShippingAreas;
  const getAreas = vi.fn(async () => Response.json({ data: areas }));
  const orderFetch = vi.fn(async (path: string, init: RequestInit) =>
    path === quotePath
      ? makeQuote(readBody(init) as StoreOrderQuoteInput)
      : created(readBody(init) as StoreOrderCreateInput),
  );
  stubOrderFetch(orderFetch, getAreas);
  render(tree());
  setupDraft("historical", "guest");
  await fillGuestAddress();
  expect(getAreas).toHaveBeenCalledTimes(1);

  areas = supportedShippingAreas.slice(1);
  submitDraft();
  const province = screen.getByRole("combobox", { name: "Province/City" });
  await waitFor(() => expect(province).toBeInvalid());
  expect(province).toHaveFocus();
  expect(getAreas).toHaveBeenCalledTimes(2);
  expect(orderFetch).not.toHaveBeenCalled();

  selectOption(province, "01");
  selectOption(screen.getByRole("combobox", { name: "Ward/Commune" }), "00004");
  orderFetch.mockImplementationOnce(async (_path, init) =>
    makeQuote(readBody(init) as StoreOrderQuoteInput, 45000, {
      ...address,
      province_code: "01",
      ward_code: "00004",
    }),
  );
  submitDraft();
  const dialog = await screen.findByRole("dialog", { name: "Review order details" });
  expect(getAreas).toHaveBeenCalledTimes(3);
  areas = supportedShippingAreas.slice(0, 1);
  fireEvent.click(within(dialog).getByRole("button", { name: "Confirm order" }));
  await waitFor(() => expect(province).toBeInvalid());
  expect(province).toHaveFocus();
  expect(getAreas).toHaveBeenCalledTimes(4);
  expect(orderFetch.mock.calls.map(([path]) => path)).toEqual([quotePath]);
  expect(dialog).not.toBeInTheDocument();
  expect(localStorage.getItem(recoverySlot)).toBeNull();
  expect(screen.getByRole("textbox", { name: "Detailed address" })).toHaveValue(address.address);
  expect(screen.getByRole("textbox", { name: /Unit price/ })).toHaveValue("34000");
});

it.each(["quote", "confirmation"] as const)(
  "fails closed when an area refresh fails before %s and preserves the draft",
  async (boundary) => {
    const getAreas = vi.fn(async () => Response.json({ data: supportedShippingAreas }));
    const orderFetch = vi.fn(async (_path: string, init: RequestInit) =>
      makeQuote(readBody(init) as StoreOrderQuoteInput),
    );
    stubOrderFetch(orderFetch, getAreas);
    render(tree());
    setupDraft("historical", "guest");
    await fillGuestAddress();
    if (boundary === "confirmation") {
      submitDraft();
      await screen.findByRole("dialog", { name: "Review order details" });
    }
    getAreas.mockResolvedValueOnce(new Response(null, { status: 503 }));
    if (boundary === "confirmation") await approveQuote();
    else submitDraft();
    expect(await screen.findByText("Could not load delivery areas.")).toBeVisible();
    expect(orderFetch.mock.calls.map(([path]) => path)).toEqual(
      boundary === "confirmation" ? [quotePath] : [],
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(localStorage.getItem(recoverySlot)).toBeNull();
    expect(screen.getByRole("textbox", { name: "Detailed address" })).toHaveValue(address.address);
    expect(screen.getByRole("textbox", { name: /Quantity/ })).toHaveValue("2");
    expect(screen.getByRole("textbox", { name: /Delivery fee/i })).toHaveValue("7000");
  },
);

it("shares an in-flight area read and retires the quote when the draft changes", async () => {
  const pending = deferred<Response>();
  const getAreas = vi.fn(async () => Response.json({ data: supportedShippingAreas }));
  const orderFetch = vi.fn(async (_path: string, init: RequestInit) =>
    makeQuote(readBody(init) as StoreOrderQuoteInput),
  );
  stubOrderFetch(orderFetch, getAreas);
  render(tree());
  setupDraft("historical", "guest");
  await fillGuestAddress();
  getAreas.mockReturnValueOnce(pending.promise);
  fireEvent.click(screen.getByRole("button", { name: "Refresh shipping areas" }));
  submitDraft();
  expect(getAreas).toHaveBeenCalledTimes(2);
  fireEvent.change(screen.getByRole("textbox", { name: /Quantity/ }), { target: { value: "3" } });
  await act(async () => pending.resolve(Response.json({ data: supportedShippingAreas })));
  expect(orderFetch).not.toHaveBeenCalled();
  submitDraft();
  await screen.findByRole("dialog", { name: "Review order details" });
  expect(orderFetch).toHaveBeenCalledOnce();
  expect(readBody(orderFetch.mock.calls[0][1])).toMatchObject({ lines: [{ quantity: 3 }] });
});

it("revalidates once on repeated confirmation and replays an uncertain guest request unchanged", async () => {
  const pending = deferred<Response>();
  const getAreas = vi.fn(async () => Response.json({ data: supportedShippingAreas }));
  const orderFetch = vi.fn(async (path: string, init: RequestInit) => {
    const input = readBody(init) as StoreOrderCreateInput;
    if (path === quotePath) return makeQuote(input);
    if (orderFetch.mock.calls.length === 2) return businessError("upstream_timeout", 504);
    return businessError("store_shipping_area_unsupported", 400);
  });
  stubOrderFetch(orderFetch, getAreas);
  render(tree());
  setupDraft("historical", "guest");
  await fillGuestAddress();
  submitDraft();
  await screen.findByRole("dialog", { name: "Review order details" });
  getAreas.mockReturnValueOnce(pending.promise);
  await approveQuote();
  expect(getAreas).toHaveBeenCalledTimes(3);
  expect(orderFetch).toHaveBeenCalledOnce();
  await act(async () => pending.resolve(Response.json({ data: supportedShippingAreas })));
  fireEvent.click(await screen.findByRole("button", { name: "Send the same request again" }));
  await waitFor(() => expect(orderFetch).toHaveBeenCalledTimes(3));
  await screen.findByRole("button", { name: "Send the same request again" });
  expect(getAreas).toHaveBeenCalledTimes(3);
  expect(orderFetch.mock.calls[2][1].body).toBe(orderFetch.mock.calls[1][1].body);
  expect(localStorage.getItem(recoverySlot)).not.toBeNull();
});

it.each(["quote", "create"] as const)(
  "refreshes shared areas after a definitive %s rejection and requires reselection",
  async (boundary) => {
    let areas = supportedShippingAreas;
    const getAreas = vi.fn(async () => Response.json({ data: areas }));
    const orderFetch = vi.fn(async (path: string, init: RequestInit) => {
      if (path === quotePath && boundary === "create")
        return makeQuote(readBody(init) as StoreOrderQuoteInput);
      if (boundary === "quote") areas = supportedShippingAreas.slice(1);
      return businessError("store_shipping_area_unsupported", 400);
    });
    stubOrderFetch(orderFetch, getAreas);
    render(tree());
    setupDraft("historical", "guest");
    await fillGuestAddress();
    submitDraft();
    if (boundary === "create") await approveQuote();

    const province = screen.getByRole("combobox", { name: "Province/City" });
    const ward = screen.getByRole("combobox", { name: "Ward/Commune" });
    await waitFor(() => expect(boundary === "quote" ? province : ward).toBeInvalid());
    await waitFor(() => expect(getAreas).toHaveBeenCalledTimes(boundary === "quote" ? 3 : 4));
    expect(screen.getByRole("textbox", { name: "Detailed address" })).toHaveValue(address.address);
    expect(localStorage.getItem(recoverySlot)).toBeNull();
    submitDraft();
    expect(orderFetch).toHaveBeenCalledTimes(boundary === "quote" ? 1 : 2);
    fireEvent.click(province);
    const replacement = screen.getByRole("option", { name: "Hà Nội" });
    expect(replacement).toBeVisible();
    if (boundary === "quote") expect(screen.queryByRole("option", { name: "Đắk Lắk" })).toBeNull();
    fireEvent.click(replacement);
    selectOption(ward, "00004");
    orderFetch.mockImplementationOnce(async (_path, init) =>
      makeQuote(readBody(init) as StoreOrderQuoteInput, 45000, {
        ...address,
        province_code: "01",
        ward_code: "00004",
      }),
    );
    submitDraft();
    expect(await screen.findByRole("dialog", { name: "Review order details" })).toBeVisible();
  },
);

beforeEach(() => {
  let pending = Promise.resolve<unknown>(undefined);
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: {
      request(_name: string, work: () => unknown) {
        const next = pending.then(work);
        pending = next.catch(() => undefined);
        return next;
      },
    },
  });
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  Reflect.deleteProperty(navigator, "locks");
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("recovers a committed order after full reload with only scoped transaction metadata", async () => {
  let sent: StoreOrderCreateInput | undefined;
  const fetcher = vi.fn(async (path: string, init: RequestInit) => {
    if (path === quotePath) return makeQuote(readBody(init) as StoreOrderQuoteInput);
    if (path === collection) {
      sent = readBody(init) as StoreOrderCreateInput;
      expect(JSON.parse(localStorage.getItem(recoverySlot) ?? "{}")).toEqual({
        key: sent.idempotency_key,
      });
      return businessError("upstream_timeout", 504);
    }
    if (!sent) throw new Error("Create was not sent");
    expect(path).toBe(`${collection}?creation_key=${sent.idempotency_key}`);
    return created(sent);
  });
  stubOrderFetch(fetcher);
  const first = render(tree());
  setupDraft("historical", "guest");
  await fillGuestAddress();
  submitDraft();
  await approveQuote();
  await screen.findByRole("button", { name: "Check result" });
  first.unmount();

  const reloaded = render(tree());
  const check = await screen.findByRole("button", { name: "Check result" });
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(
    screen.queryByRole("button", { name: "Send the same request again" }),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole("textbox", { name: /Quantity/ })).not.toBeInTheDocument();
  fireEvent.click(check);
  expect(await screen.findByRole("link", { name: "Open order details" })).toHaveAttribute(
    "href",
    `/store-orders/${orderId}`,
  );
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(localStorage.getItem(recoverySlot)).toContain(orderId);
  reloaded.rerender(tree(false, "one", undefined, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"));
  expect(localStorage.getItem(recoverySlot)).toContain(orderId);
  reloaded.rerender(tree(false, "one", undefined, orderId));
  reloaded.rerender(tree());
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Create order" })).toBeEnabled();
    expect(localStorage.getItem(recoverySlot)).toBeNull();
  });
  reloaded.unmount();
  render(tree(true, "two"));
  expect(screen.queryByRole("button", { name: "Check result" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Create order" })).toBeEnabled();
});

it("keeps the reload form blocked after a 404 and closes only the old key", async () => {
  const key = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  localStorage.setItem(recoverySlot, JSON.stringify({ key }));
  const fetcher = vi.fn(async (path: string, init: RequestInit) => {
    if (path === `${collection}?creation_key=${key}`)
      return businessError("create_receipt_not_found", 404);
    expect(path).toBe(`${collection}/close-creation`);
    expect(readBody(init)).toEqual({ idempotency_key: key });
    return Response.json({
      data: { closed: true },
      meta: {
        action_receipt: { action: "create_store_order", idempotency_key: key, resource_id: null },
      },
    });
  });
  vi.stubGlobal("fetch", fetcher);
  render(tree());
  fireEvent.click(await screen.findByRole("button", { name: "Check result" }));
  expect(await screen.findByText(/may still be processing/)).toBeVisible();
  expect(screen.getByRole("button", { name: "Create order" })).toBeDisabled();
  expect(localStorage.getItem(recoverySlot)).toContain(key);
  fireEvent.click(screen.getByRole("button", { name: "Close previous request" }));
  expect(await screen.findByText(/previous request was closed/i)).toBeVisible();
  expect(localStorage.getItem(recoverySlot)).toBeNull();
  expect(screen.getByRole("button", { name: "Create order" })).toBeEnabled();
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("refuses to send from an already reviewed tab when another tab reserves a key first", async () => {
  const key = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const fetcher = vi.fn(async (path: string, init: RequestInit) => {
    expect(path).toBe(quotePath);
    return makeQuote(readBody(init) as StoreOrderQuoteInput);
  });
  vi.stubGlobal("fetch", fetcher);
  render(tree());
  setupDraft();
  submitDraft();
  await screen.findByRole("dialog", { name: "Review order details" });
  // Delay the other tab's storage event so this tab must check inside the lock.
  localStorage.setItem(recoverySlot, JSON.stringify({ key }));
  await approveQuote();
  expect(await screen.findByRole("button", { name: "Check result" })).toBeVisible();
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(localStorage.getItem(recoverySlot)).toBe(JSON.stringify({ key }));
});

it.each(["corrupt", "unavailable"])(
  "blocks create when recovery storage is %s",
  async (failure) => {
    if (failure === "corrupt")
      localStorage.setItem(recoverySlot, '{"key":"wrong","payload":"private"}');
    const getItem = vi.spyOn(Storage.prototype, "getItem");
    if (failure === "unavailable")
      getItem.mockImplementation(() => {
        throw new Error("storage disabled");
      });
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    try {
      render(tree());
      expect(
        await screen.findByText(
          failure === "corrupt" ? /information is invalid/ : /storage is unavailable/,
        ),
      ).toBeVisible();
      expect(screen.getByRole("button", { name: "Create order" })).toBeDisabled();
      expect(fetcher).not.toHaveBeenCalled();
    } finally {
      getItem.mockRestore();
    }
  },
);

it("does not send a create when the browser cannot write its recovery key", async () => {
  const fetcher = vi.fn(async (path: string, init: RequestInit) => {
    expect(path).toBe(quotePath);
    return makeQuote(readBody(init) as StoreOrderQuoteInput);
  });
  vi.stubGlobal("fetch", fetcher);
  render(tree());
  setupDraft();
  submitDraft();
  await screen.findByRole("dialog", { name: "Review order details" });
  const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("quota exceeded");
  });
  try {
    await approveQuote();
    expect(await screen.findByText(/storage is unavailable/)).toBeVisible();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("textbox", { name: /Quantity/ })).toHaveValue("2");
  } finally {
    write.mockRestore();
  }
});

it("keeps the key when the current Admin session changes during recovery", async () => {
  const key = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  localStorage.setItem(recoverySlot, JSON.stringify({ key }));
  const fetcher = vi.fn(async () => businessError("session_changed", 409));
  vi.stubGlobal("fetch", fetcher);
  const previous = render(tree());
  fireEvent.click(await screen.findByRole("button", { name: "Check result" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/permission|allowed|access/i);
  expect(localStorage.getItem(recoverySlot)).toContain(key);
  previous.unmount();
  render(tree());
  expect(await screen.findByRole("button", { name: "Check result" })).toBeEnabled();
  expect(fetcher).toHaveBeenCalledTimes(1);
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
    stubOrderFetch(
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
    if (buyer === "guest") await fillGuestAddress();
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

it.each([
  [null, null],
  ["34000", "7000"],
  ["0", null],
])("quotes and records historical unit price %s and delivery fee %s", async (unitPrice, fee) => {
  const expectedPrice = unitPrice ?? product.retail_price_vnd;
  const expectedFee = fee ?? "0";
  const fetcher = vi.fn(async (path: string, init: RequestInit) => {
    if (path.startsWith("/api/backend/admin/store-products?"))
      return Response.json({
        data: [{ ...product, retail_price_vnd: "59000" }],
        meta: { page: 1, page_size: 50, total: 1 },
      });
    if (path === quotePath) return makeQuote(readBody(init) as StoreOrderQuoteInput);
    return created(readBody(init) as StoreOrderCreateInput, { id: orderId });
  });
  stubOrderFetch(fetcher);
  render(tree());
  selectOrder("historical", "guest");
  await fillGuestAddress();
  const feeInput = () => screen.getByRole("textbox", { name: /Delivery fee \(VND\)/ });
  const priceInput = (name: string) =>
    screen.getByRole("textbox", { name: `Unit price (VND) · ${name}` });
  const expectTotal = (total: string) => {
    const label = within(screen.getByRole("region", { name: "Payment" })).getByText(
      "Total to record",
    );
    expect(label.nextElementSibling).toHaveTextContent(formatStoreMoney(total, "en"));
  };
  expect(feeInput()).toHaveValue("0");
  addProduct();
  expect(screen.getByRole("textbox", { name: "Quantity · Tomato" })).toHaveValue("1");
  expect(priceInput("Tomato")).toHaveValue("45000");
  expect(
    within(screen.getByRole("listitem", { name: "Tomato" })).getByText(
      formatStoreMoney("45000", "en"),
    ),
  ).toBeVisible();
  expectTotal("45000");

  if (fee !== null) fireEvent.change(feeInput(), { target: { value: fee } });
  if (unitPrice !== null) {
    fireEvent.change(priceInput("Tomato"), { target: { value: unitPrice } });
    fireEvent.change(screen.getByRole("textbox", { name: "Quantity · Tomato" }), {
      target: { value: "2" },
    });
    expect(priceInput("Tomato")).toHaveValue(unitPrice);
    await act(async () => fireEvent.click(screen.getByRole("radio", { name: "New order" })));
    expect(
      screen.queryByRole("textbox", { name: /Unit price \(VND\)|Delivery fee \(VND\)/ }),
    ).not.toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole("radio", { name: "Delivered order" })));
    expect(
      fetcher.mock.calls.filter(([path]) => path.startsWith("/api/backend/admin/store-products?")),
    ).toHaveLength(2);
    expect(priceInput("Tomato")).toHaveValue(unitPrice);
    fireEvent.change(screen.getByRole("textbox", { name: "Delivery date" }), {
      target: { value: isoDateToAdminInput(storeOrderDateRange("historical").max) },
    });
  }
  addProduct("Basil");
  expect(priceInput("Tomato")).toHaveValue(expectedPrice);
  expect(screen.getByRole("textbox", { name: "Quantity · Basil" })).toHaveValue("1");
  expect(priceInput("Basil")).toHaveValue("12000");
  expect(feeInput()).toHaveValue(expectedFee);
  const tomatoQuantity = unitPrice === null ? 1 : 2;
  expectTotal(String(Number(expectedPrice) * tomatoQuantity + 12000 + Number(expectedFee)));

  submitDraft();
  const dialog = await screen.findByRole("dialog", { name: "Review order details" });
  expect(
    within(dialog).queryByText(/Calculated at confirmation|Tính theo xác nhận của Backend/),
  ).not.toBeInTheDocument();
  await approveQuote();
  const newOrder = await screen.findByRole("button", { name: "Create another order" });
  expect(
    fetcher.mock.calls
      .filter(([path]) => path === quotePath || path === collection)
      .map(([, init]) => readBody(init)),
  ).toEqual(
    Array.from({ length: 2 }, () =>
      expect.objectContaining({
        shipping_fee_vnd: expectedFee,
        lines: [
          { product_id: product.id, unit_price_vnd: expectedPrice, quantity: tomatoQuantity },
          { product_id: discontinuedProduct.id, unit_price_vnd: "12000", quantity: 1 },
        ],
      }),
    ),
  );
  fireEvent.click(newOrder);
  fireEvent.click(await screen.findByRole("radio", { name: "Delivered order" }));
  expect(feeInput()).toHaveValue("0");
});

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
  await waitFor(() => expect(finish).toBeTypeOf("function"));
  view.rerender(tree(false));
  if (request) {
    const response = created(request, { malformed: true });
    await act(async () => finish(response));
  }
  expect(router.replace).not.toHaveBeenCalled();
  view.rerender(tree());
  expect(await screen.findByRole("link", { name: "Open order details" })).toHaveAttribute(
    "href",
    `/store-orders/${orderId}`,
  );
  expect(router.replace).not.toHaveBeenCalled();
  router.replace.mockClear();
  view.rerender(tree(true, "two"));
  expect(screen.queryByRole("link", { name: "Open order details" })).not.toBeInTheDocument();
  setupDraft();
  submitDraft();
  await approveQuote();
  await waitFor(() =>
    expect(localStorage.getItem("nfv-admin-store-order-recovery:v1:test-two")).not.toBeNull(),
  );
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
    stubOrderFetch(
      vi.fn((path: string, init: RequestInit) => {
        if (path === quotePath)
          return Promise.resolve(makeQuote(readBody(init) as StoreOrderQuoteInput));
        return new Promise<Response>((resolve) => (finish = resolve));
      }),
    );
    const view = render(tree());
    setupDraft("historical", "guest");
    await fillGuestAddress();
    submitDraft();
    await approveQuote();
    await waitFor(() => expect(finish).toBeTypeOf("function"));
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
  expect(await screen.findByRole("button", { name: "Create order" })).toBeEnabled();
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

it.each([
  [/Quantity/, "2", "3"],
  [/Unit price/, "34000", "35000"],
  [/Delivery fee \(VND\)/, "7000", "8000"],
])(
  "blocks quote and creation after invalid numeric input in %s",
  async (name, original, corrected) => {
    const fetcher = vi.fn(async (_path: string, init: RequestInit) =>
      makeQuote(readBody(init) as StoreOrderQuoteInput),
    );
    stubOrderFetch(fetcher);
    render(tree());
    setupDraft("historical", "guest");
    await fillGuestAddress();
    const input = screen.getByRole<HTMLInputElement>("textbox", { name });
    input.select();
    fireEvent.paste(input, { clipboardData: { getData: () => "34\n000" } });
    expect(input).toHaveValue(original);
    expect(input).toHaveAttribute("aria-invalid", "true");
    submitDraft();
    expect(fetcher).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "" } });
    expect(input).toHaveValue("");
    submitDraft();
    expect(fetcher).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: corrected } });
    submitDraft();
    expect(await screen.findByRole("dialog", { name: "Review order details" })).toBeVisible();
  },
);

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

it("reconciles products in one request on kind change and preserves unrelated line errors", async () => {
  const fetcher = vi.fn(async (path: string) => {
    if (path.startsWith("/api/backend/admin/store-products?")) {
      const query = new URL(path, "https://admin.test").searchParams;
      expect(query.get("order_kind")).toBe("new");
      expect(query.get("product_ids")).toBe(product.id);
      return Response.json({ data: [], meta: { page: 1, page_size: 50, total: 0 } });
    }
    expect(path).toBe(quotePath);
    return Response.json(
      { errors: [{ code: "store_product_changed", context: { product_ids: [product.id] } }] },
      { status: 400 },
    );
  });
  stubOrderFetch(fetcher);
  render(tree());
  setupDraft("historical", "guest");
  await fillGuestAddress();
  fireEvent.click(screen.getByRole("radio", { name: "New order" }));
  expect(await screen.findByText(/unavailable for the selected order type/i)).toBeVisible();
  expect(screen.getByRole("textbox", { name: /Quantity/ })).toHaveValue("2");
  fireEvent.change(screen.getByRole("textbox", { name: "Delivery date" }), {
    target: { value: isoDateToAdminInput(adminTodayIso()) },
  });
  submitDraft();
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  await waitFor(() =>
    expect(document.activeElement).toHaveTextContent(/unavailable for the selected order type/i),
  );
  fireEvent.change(screen.getByRole("textbox", { name: /Quantity/ }), { target: { value: "3" } });
  expect(screen.getByRole("textbox", { name: /Quantity/ })).toHaveValue("3");
  expect(screen.getByText(/unavailable for the selected order type/i)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: /Remove Tomato/ }));
  expect(screen.queryByText(/unavailable for the selected order type/i)).not.toBeInTheDocument();
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
