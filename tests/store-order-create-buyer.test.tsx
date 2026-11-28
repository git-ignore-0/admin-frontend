import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { AdminI18nProvider } from "@/components/admin-i18n-provider";
import { AdminQueryProvider } from "@/components/admin-query-provider";
import { StoreOrderBuyerFields, useStoreOrderBuyer } from "@/components/store-order-create-buyer";
import { selectOption } from "./select-option";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const primary = "58cbea40-4749-4400-9fa3-188de573abaf";
const secondary = "7af0659a-3d22-4d48-8dbd-c947800e0e11";
const phone = "+84912345678";
const timestamp = "2026-07-20T00:00:00Z";

function user(id: string, name: string) {
  return {
    id,
    name,
    email: null,
    login_phone_number: phone,
    email_verified: false,
    phone: "",
    province_code: "",
    ward_code: "",
    address: "",
    has_csa_customer: false,
    points_balance: 0,
    date_joined: timestamp,
    status: "active",
  };
}

function detail(id: string, name: string, phoneNumber = phone) {
  return {
    ...user(id, name),
    invited_users: [],
    invited_count: 0,
    referral_code: "code",
    referrer: null,
    source: "organic",
    shipping_address: {
      id: "1cc92eb5-071c-4d02-82ed-faf8d40d754c",
      recipient_name: name,
      phone_number: phoneNumber,
      province_code: "01",
      ward_code: "00004",
      address: `${name} Street`,
      is_supported: true,
      shipping_fee_vnd: "12000",
      created_at: timestamp,
      updated_at: timestamp,
    },
  };
}

function wrapper({ children }: { children: ReactNode }) {
  return (
    <AdminI18nProvider initialLocale="en">
      <AdminQueryProvider>{children}</AdminQueryProvider>
    </AdminI18nProvider>
  );
}

function BuyerHarness({
  type = "user",
  kind = "new",
}: {
  type?: "user" | "guest";
  kind?: "new" | "historical";
}) {
  const [buyerType, onBuyerTypeChange] = useState(type);
  const [userId, onUserChange] = useState<string | null>(null);
  const [guest, onGuestChange] = useState({
    recipient_name: "",
    phone_number: "",
    province_code: "",
    ward_code: "",
    address: "",
  });
  const lookup = useStoreOrderBuyer(userId);
  return (
    <StoreOrderBuyerFields
      kind={kind}
      buyerType={buyerType}
      onBuyerTypeChange={onBuyerTypeChange}
      userId={userId}
      onUserChange={onUserChange}
      guest={guest}
      onGuestChange={onGuestChange}
      lookup={lookup}
    />
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("searches on the server, fetches only the chosen user and renders their read-only address", async () => {
  const fetcher = vi.fn(async (path: string) => {
    if (path.includes("/users?")) {
      const conditions = new URL(path, "https://admin.test").searchParams;
      expect(conditions.get("search")).toBe("Taylor");
      return Response.json({
        data: [user(primary, "Taylor One"), user(secondary, "Taylor Two")],
        meta: { page: 1, page_size: 30, total: 2 },
      });
    }
    if (path.includes(primary)) return Response.json({ data: detail(primary, "Taylor One") });
    return Response.json({ data: [] });
  });
  vi.stubGlobal("fetch", fetcher);
  render(<BuyerHarness />, { wrapper });
  expect(fetcher).not.toHaveBeenCalled();

  const input = screen.getByRole("combobox", { name: "System user" });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "Taylor" } });
  fireEvent.click(await screen.findByRole("option", { name: /Taylor One/ }));
  expect(await screen.findByText("Taylor One Street")).toBeVisible();
  expect(screen.getByText("Recipient name").tagName).toBe("DT");
  expect(screen.queryByRole("textbox", { name: "Recipient name" })).not.toBeInTheDocument();
  expect(fetcher.mock.calls.some(([path]) => path.includes(secondary))).toBe(false);
});

it("hides a previous choice immediately and ignores a late user detail response", async () => {
  let finishPrimary!: (response: Response) => void;
  let oldSignal: AbortSignal | null | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, options?: RequestInit) => {
      if (path.includes(primary)) {
        oldSignal = options?.signal;
        return new Promise<Response>((resolve) => (finishPrimary = resolve));
      }
      return Response.json({ data: detail(secondary, "Current", "—") });
    }),
  );
  const { result, rerender } = renderHook(({ id }) => useStoreOrderBuyer(id), {
    wrapper,
    initialProps: { id: primary },
  });
  await waitFor(() => expect(oldSignal).toBeDefined());
  rerender({ id: secondary });
  expect(result.current.address).toBeNull();
  await waitFor(() => expect(result.current.address?.recipient_name).toBe("Current"));
  expect(result.current.eligible).toBe(false);
  expect(result.current.issue).toBe("phone_invalid");
  await act(async () => finishPrimary(Response.json({ data: detail(primary, "Old") })));
  expect(oldSignal?.aborted).toBe(true);
  expect(result.current.address?.recipient_name).toBe("Current");
});

it("restricts new guest orders to supported areas and resets the ward when the province changes", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        data: [
          {
            province_code: "01",
            province_name: "First City",
            wards: [{ ward_code: "00004", ward_name: "First Ward", shipping_fee_vnd: "0" }],
          },
          {
            province_code: "02",
            province_name: "Second City",
            wards: [{ ward_code: "00005", ward_name: "Second Ward", shipping_fee_vnd: "0" }],
          },
        ],
      }),
    ),
  );
  render(<BuyerHarness type="guest" />, { wrapper });
  const province = screen.getByRole("combobox", { name: "Province/city" });
  const ward = screen.getByRole("combobox", { name: "Ward/commune" });
  await waitFor(() => expect(province).toBeEnabled());
  selectOption(province, "01");
  selectOption(ward, "00004");
  expect(ward).toHaveValue("First Ward");
  selectOption(province, "02");
  expect(ward).toHaveValue("");
});

it("clears an unsupported historical guest location while retaining shared recipient fields", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string) => {
      if (path.includes("administrative-units/provinces"))
        return Response.json({ data: [{ code: "02", name: "Historical city" }] });
      if (path.includes("administrative-units/wards"))
        return Response.json({ data: [{ code: "00005", name: "Historical ward" }] });
      return Response.json({
        data: [
          {
            province_code: "01",
            province_name: "Current city",
            wards: [{ ward_code: "00004", ward_name: "Current ward", shipping_fee_vnd: "0" }],
          },
        ],
      });
    }),
  );
  const view = render(<BuyerHarness type="guest" kind="historical" />, { wrapper });
  const province = screen.getByRole("combobox", { name: "Province/city" });
  const ward = screen.getByRole("combobox", { name: "Ward/commune" });
  fireEvent.change(screen.getByRole("textbox", { name: "Recipient name" }), {
    target: { value: "Taylor" },
  });
  await waitFor(() => expect(province).toBeEnabled());
  selectOption(province, "02");
  await waitFor(() => expect(ward).toBeEnabled());
  selectOption(ward, "00005");
  expect(province).toHaveValue("Historical city");
  expect(ward).toHaveValue("Historical ward");
  view.rerender(<BuyerHarness type="guest" kind="new" />);
  await waitFor(() => expect(province).toHaveValue(""));
  expect(ward).toHaveValue("");
  expect(screen.getByRole("textbox", { name: "Recipient name" })).toHaveValue("Taylor");
  view.rerender(<BuyerHarness type="guest" kind="historical" />);
  expect(province).toHaveValue("");
  expect(ward).toHaveValue("");
});
