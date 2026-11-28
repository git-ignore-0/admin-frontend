import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
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
  errors,
}: {
  type?: "user" | "guest";
  kind?: "new" | "historical";
  errors?: { user?: string };
}) {
  const [buyerType, onBuyerTypeChange] = useState(type);
  const [userId, onUserChange] = useState<string | null>(null);
  const [guestPhoneRejected, onGuestPhoneRejectionChange] = useState(false);
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
      onGuestChange={(next) => {
        if (next.phone_number !== guest.phone_number) onGuestPhoneRejectionChange(false);
        onGuestChange(next);
      }}
      guestPhoneRejected={guestPhoneRejected}
      onGuestPhoneRejectionChange={onGuestPhoneRejectionChange}
      lookup={lookup}
      errors={errors}
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
    if (path.includes(secondary)) return Response.json({ data: detail(secondary, "Taylor Two") });
    return Response.json({ data: [] });
  });
  vi.stubGlobal("fetch", fetcher);
  render(<BuyerHarness />, { wrapper });
  expect(fetcher).not.toHaveBeenCalled();

  const input = screen.getByRole("combobox", { name: "Search users" });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "Taylor" } });
  await screen.findByRole("option", { name: /Taylor One/ });
  fireEvent.keyDown(input, { key: "ArrowDown", code: "ArrowDown" });
  fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

  const change = screen.getByRole("button", { name: "Change user" });
  expect(change).toHaveFocus();
  const selected = screen.getByRole("group", { name: "Selected user" });
  expect(await within(selected).findByText("Taylor One")).toBeVisible();
  const address = screen.getByRole("region", { name: "Delivery address" });
  expect(within(address).getByText("Taylor One Street")).toBeVisible();
  expect(within(address).getByText("Recipient name").tagName).toBe("DT");
  expect(within(address).queryByRole("textbox")).not.toBeInTheDocument();
  expect(screen.queryByRole("combobox", { name: "Search users" })).not.toBeInTheDocument();
  expect(fetcher.mock.calls.some(([path]) => path.includes(secondary))).toBe(false);

  fireEvent.click(change);
  const replacement = screen.getByRole("combobox", { name: "Search users" });
  expect(replacement).toHaveFocus();
  expect(replacement).toHaveValue("");
  expect(screen.queryByRole("region", { name: "Delivery address" })).not.toBeInTheDocument();
  fireEvent.change(replacement, { target: { value: "Taylor" } });
  fireEvent.click(await screen.findByRole("option", { name: /Taylor Two/ }));
  expect(
    await within(screen.getByRole("group", { name: "Selected user" })).findByText("Taylor Two"),
  ).toBeVisible();
  expect(screen.queryByText("Taylor One Street")).not.toBeInTheDocument();
});

it("keeps unsubmitted user search text through blur without selecting an account", async () => {
  const fetcher = vi.fn(async () =>
    Response.json({
      data: [user(primary, "Taylor One")],
      meta: { page: 1, page_size: 30, total: 1 },
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  render(<BuyerHarness />, { wrapper });

  const input = screen.getByRole("combobox", { name: "Search users" });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "Taylor" } });
  await screen.findByRole("option", { name: /Taylor One/ });
  fireEvent.blur(input);

  expect(input).toHaveValue("Taylor");
  expect(screen.queryByRole("button", { name: "Change user" })).not.toBeInTheDocument();
  expect(fetcher.mock.calls).toHaveLength(1);
});

it("associates a selected-user error with the Change user button", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string) =>
      path.includes("/users?")
        ? Response.json({
            data: [user(primary, "Taylor")],
            meta: { page: 1, page_size: 20, total: 1 },
          })
        : Response.json({ data: detail(primary, "Taylor") }),
    ),
  );
  const view = render(<BuyerHarness />, { wrapper });
  const search = screen.getByRole("combobox", { name: "Search users" });
  fireEvent.focus(search);
  fireEvent.change(search, { target: { value: "Taylor" } });
  fireEvent.click(await screen.findByRole("option", { name: /Taylor/ }));
  const change = screen.getByRole("button", { name: "Change user" });
  view.rerender(<BuyerHarness errors={{ user: "This user is no longer eligible." }} />);
  expect(screen.getByRole("alert")).toHaveTextContent("This user is no longer eligible.");
  expect(change).toHaveAccessibleDescription("This user is no longer eligible.");
  expect(change).toHaveAttribute("aria-invalid", "true");
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

it("labels guest address controls and validates the shipping phone with the Store phone rules", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ data: [] })),
  );
  render(<BuyerHarness type="guest" />, { wrapper });
  const input = screen.getByRole("textbox", { name: "Phone number" });
  expect(input).toHaveAttribute("type", "tel");
  expect(input).toHaveAttribute("inputmode", "tel");
  expect(input).toHaveAttribute("autocomplete", "shipping tel-national");
  expect(screen.getByRole("textbox", { name: "Street address" })).toHaveAttribute(
    "autocomplete",
    "shipping address-line1",
  );
  expect(await screen.findByText("There are no supported shipping areas.")).toBeVisible();

  fireEvent.change(input, { target: { value: "0912" } });
  fireEvent.blur(input);
  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(input).toHaveAccessibleDescription("Enter a valid phone number.");
  fireEvent.change(input, { target: { value: "0912345678" } });
  expect(input).not.toHaveAttribute("aria-invalid", "true");
});

it("keeps guest phone edits to ASCII digits and rejects mixed paste as a whole", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ data: [] })),
  );
  render(<BuyerHarness type="guest" />, { wrapper });
  expect(await screen.findByText("There are no supported shipping areas.")).toBeVisible();
  const input = screen.getByRole<HTMLInputElement>("textbox", { name: "Phone number" });
  fireEvent.input(input, { target: { value: "0912" } });
  fireEvent.input(input, { target: { value: "0912a" } });
  expect(input).toHaveValue("0912");
  fireEvent.input(input, { target: { value: "0912９" } });
  expect(input).toHaveValue("0912");

  input.setSelectionRange(2, 4);
  for (const text of ["3abc4", "3\n4", "+8434"]) {
    expect(fireEvent.paste(input, { clipboardData: { getData: () => text } })).toBe(false);
    expect(input).toHaveValue("0912");
    expect(input.selectionStart).toBe(2);
    expect(input.selectionEnd).toBe(4);
  }
  expect(fireEvent.paste(input, { clipboardData: { getData: () => "345678" } })).toBe(true);
  fireEvent.input(input, { target: { value: "09345678" } });
  expect(input).toHaveValue("09345678");
});

it("reports a rejected phone paste until the guest phone is edited or confirmed", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ data: [] })),
  );
  render(<BuyerHarness type="guest" />, { wrapper });
  expect(await screen.findByText("There are no supported shipping areas.")).toBeVisible();
  const input = screen.getByRole<HTMLInputElement>("textbox", { name: "Phone number" });
  fireEvent.input(input, { target: { value: "0912345678" } });
  input.select();
  const paste = () => fireEvent.paste(input, { clipboardData: { getData: () => "0902 345 678" } });
  expect(paste()).toBe(false);
  expect(input).toHaveValue("0912345678");
  expect(input).toHaveAccessibleDescription(/paste rejected/i);
  fireEvent.click(screen.getByRole("button", { name: "Use the current number" }));
  expect(input).toHaveFocus();
  expect(input).not.toHaveAttribute("aria-invalid", "true");
  expect(paste()).toBe(false);
  fireEvent.input(input, { target: { value: "0902345678" } });
  expect(input).not.toHaveAttribute("aria-invalid", "true");
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
